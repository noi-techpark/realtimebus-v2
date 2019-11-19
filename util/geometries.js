'use strict';

const SASA_CSV_URL = 'http://www.sasabz.it/fileadmin/files/varianti.csv';
const SASA_KML_URL = 'http://www.sasabz.it/fileadmin/files/sasa_ge_routesdata.kml';

const config = require("../config");

const _ = require('underscore');
const csv = require('csvtojson');
const tj = require('@mapbox/togeojson');
const fs = require('fs');
const dom = require('xmldom').DOMParser;
const turf = require('@turf/turf');
const Color = require('color');
const fetch = require('node-fetch');
const { Client } = require('pg');

module.exports = {

    generateRoutes: (buffer) => {
        var segments = []

        for (var i = 0; i < buffer.length; i++) {
            var direction = null

            if (buffer[i].name.includes('andata') && !buffer[i].name.includes('ritorno')) {
                direction = 'way'
            }

            if (!buffer[i].name.includes('andata') && buffer[i].name.includes('ritorno')) {
                direction = 'return'
            }

            for (var j = 1; j < buffer[i].path.length; j++) {
                let from = buffer[i].path[j - 1]
                let to = buffer[i].path[j]

                var segment = {
                    from: from,
                    fromString: '[' + from[0] + ',' + from[1] + ']',
                    to: to,
                    toString: '[' + to[0] + ',' + to[1] + ']'
                }

                if (direction === null) {
                    segments.push(_.extend({}, segment, {
                        direction: 'way',
                        from: segment.from,
                        fromString: segment.fromString,
                        to: segment.to,
                        toString: segment.toString
                    }))

                    segments.push(_.extend({}, segment, {
                        direction: 'return',
                        from: segment.to,
                        fromString: segment.toString,
                        to: segment.from,
                        toString: segment.fromString
                    }))
                } else {
                    segments.push(_.extend({}, segment, {
                        direction: direction
                    }))
                }
            }
        }



        // SPLIT SEGMENTS BASED ON OVERLAPS

        var alignedSegments = []

        for (var i = 0; i < segments.length; i++) {
            var segment = segments[i]
            var segmentLine = turf.lineString([segment.from, segment.to])

            var midpoints = []

            for (var j = 0; j < segments.length; j++) {
                var otherSegment = segments[j]
                var fromPoint = turf.point(otherSegment.from)
                var toPoint = turf.point(otherSegment.to)

                if (turf.booleanPointOnLine(fromPoint, segmentLine, { ignoreEndVertices: true })) {
                    midpoints.push(otherSegment.from)
                    continue
                }

                if (turf.booleanPointOnLine(toPoint, segmentLine, { ignoreEndVertices: true })) {
                    midpoints.push(otherSegment.to)
                    continue
                }

                var nearestPointBasedOnFrom = turf.nearestPointOnLine(segmentLine, fromPoint)
                if (nearestPointBasedOnFrom.properties.dist > 0.0 && nearestPointBasedOnFrom.properties.dist <= 0.0005) {
                    midpoints.push(nearestPointBasedOnFrom.geometry.coordinates)
                    continue
                }

                var nearestPointBasedOnTo = turf.nearestPointOnLine(segmentLine, toPoint)
                if (nearestPointBasedOnTo.properties.dist > 0.0 && nearestPointBasedOnTo.properties.dist <= 0.0005) {
                    midpoints.push(nearestPointBasedOnTo.geometry.coordinates)
                    continue
                }
            }

            midpoints = _.uniq(midpoints, false, (midpoint) => {
                return '[' + midpoint[0] + ',' + midpoint[1] + ']'
            })

            midpoints = midpoints.map((midpoint) => {
                return {
                    point: midpoint,
                    distance: turf.distance(turf.point(segment.from), turf.point(midpoint))
                }
            })

            midpoints = _.sortBy(midpoints, 'distance')

            if (midpoints.length > 0) {
                var previousPoint = segment.from
                var previousPointString = segment.fromString

                for (var j = 0; j < midpoints.length; j++) {
                    var point = midpoints[j].point
                    var pointString = '[' + point[0] + ',' + point[1] + ']'

                    alignedSegments.push({
                        direction: segment.direction,
                        from: previousPoint,
                        fromString: previousPointString,
                        to: point,
                        toString: pointString
                    })

                    previousPoint = point
                    previousPointString = pointString
                }

                alignedSegments.push({
                    direction: segment.direction,
                    from: previousPoint,
                    fromString: previousPointString,
                    to: segment.to,
                    toString: segment.toString
                })
            } else {
                alignedSegments.push(segment)
            }
        }

        segments = alignedSegments.slice()



        // NORMALIZE POINTS THAT COLLIDE/OVERLAP

        var normalizedSegments = segments.slice()
        var normalizedPoints = []

        for (var i = 0; i < normalizedSegments.length; i++) {
            var fromMatches = normalizedPoints.filter((entry) => turf.distance(turf.point(normalizedSegments[i].from), turf.point(entry.point)) <= 0.0005)

            if (fromMatches.length > 0) {
                normalizedSegments[i].from = fromMatches[0].point
                normalizedSegments[i].fromString = fromMatches[0].pointString
            } else {
                normalizedPoints.push({
                    point: normalizedSegments[i].from,
                    pointString: normalizedSegments[i].fromString
                })
            }

            var toMatches = normalizedPoints.filter((entry) => turf.distance(turf.point(normalizedSegments[i].to), turf.point(entry.point)) <= 0.0005)

            if (toMatches.length > 0) {
                normalizedSegments[i].to = toMatches[0].point
                normalizedSegments[i].toString = toMatches[0].pointString
            } else {
                normalizedPoints.push({
                    point: normalizedSegments[i].to,
                    pointString: normalizedSegments[i].toString
                })
            }
        }

        normalizedSegments = normalizedSegments.filter((normalizedSegment) => {
            return normalizedSegment.fromString !== normalizedSegment.toString
        })

        segments = normalizedSegments.slice()



        // FILL MISSING SEGMENTS

        var filledSegments = segments.slice()

        var detectedAnomaly = false

        do {
            detectedAnomaly = false

            for (var i = 0; i < filledSegments.length; i++) {
                var segment = filledSegments[i]
                var oppositeDirection = segment.direction === 'way' ? 'return' : 'way'

                var shouldReverseSegment = (
                    filledSegments.filter((otherSegment) => {
                        return otherSegment.direction === oppositeDirection && otherSegment.fromString === segment.fromString
                    }).length > 0 && filledSegments.filter((otherSegment) => {
                        return otherSegment.direction === oppositeDirection && otherSegment.fromString === segment.toString
                    }).length === 0 && filledSegments.filter((otherSegment) => {
                        return otherSegment.direction === oppositeDirection && otherSegment.toString === segment.fromString
                    }).length === 0
                ) || (
                    filledSegments.filter((otherSegment) => {
                        return otherSegment.direction === oppositeDirection && otherSegment.toString === segment.toString
                    }).length > 0 && filledSegments.filter((otherSegment) => {
                        return otherSegment.direction === oppositeDirection && otherSegment.fromString === segment.toString
                    }).length === 0
                )

                if (shouldReverseSegment) {
                    filledSegments.push(_.extend({}, segment, {
                        direction: oppositeDirection,
                        from: segment.to,
                        fromString: segment.toString,
                        to: segment.from,
                        toString: segment.fromString
                    }))

                    detectedAnomaly = true

                    break
                }
            }
        } while (detectedAnomaly)

        segments = filledSegments.slice()



        // FILTER OUT "APPENDICES"

        segments = segments.slice().filter((segment) => {
            return !((
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.fromString === otherSegment.toString).length > 0 &&
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.fromString === otherSegment.fromString && segment.toString !== otherSegment.toString).length > 0 &&
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.toString === otherSegment.fromString).length === 0
            ) || (
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.toString === otherSegment.fromString).length > 0 &&
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.toString === otherSegment.toString && segment.fromString !== otherSegment.fromString).length > 0 &&
                segments.filter((otherSegment) => segment.direction === otherSegment.direction && segment.fromString === otherSegment.toString).length === 0
            ))
        })



        return segments
    },

    fetchParts: async () => {
        var csvResponse = await fetch(SASA_CSV_URL)

        return await csv({
            delimiter: ';',
            colParser: {
                'Teilstuecke': (item) => {
                    return _.map(item.split(','), (part) => part.trim())
                }
            }
        }).fromString(await csvResponse.text())
    },

    fetchGeometries: async () => {
        var kmlResponse = await fetch(SASA_KML_URL)

        var geometries = tj.kml(new dom().parseFromString(await kmlResponse.text()))

        geometries = _.map(geometries.features, (route) => {
            if (route.geometry.type !== 'LineString') {
                return null
            }

            return {
                name: route.properties.name,
                color: route.properties.stroke,
                path: route.geometry.coordinates.map((coord) => {
                    return [ coord[0], coord[1] ]
                })
            }
        })

        geometries = _.filter(geometries, (geometry) => !!geometry)

        return geometries
    },

    update: async () => {
        var self = module.exports

        var routeParts = await self.fetchParts()

        var routeGeometries = await self.fetchGeometries()

        const db = new Client({
            host: config.database.host || '127.0.0.1',
            database: config.database.name,
            user: config.database.username,
            password: config.database.password,
            port: config.database.port || 5432
        })

        await db.connect()

        var routeSlugs = await db.query('SELECT DISTINCT rl.li_kuerzel AS "slug" FROM data.rec_lid as rl ORDER BY 1 ASC')

        routeSlugs = routeSlugs.rows.map((row) => row.slug)

        for (var slug in routeSlugs) {
            var routeSlug = routeSlugs[slug]

            // console.log('Processing slug: %s', routeSlug)

            var routePaths = []

            var routeTupleParts = routeParts.slice().filter((tuple) => tuple.Abbreviazione === routeSlug)

            var color = null

            for (var part in routeTupleParts) {
                var routeTuple = routeTupleParts[part]

                var geometries = routeGeometries.slice().filter((geometry) => {
                    return _.indexOf(routeTuple.Teilstuecke, geometry.name) !== -1 && !!geometry.path
                })

                if (geometries.length > 0) {
                    color = geometries[0].color
                }

                var segments = self.generateRoutes(geometries)

                routePaths.push(segments)
            }

            // console.log('  > Processing %d tuples', routePaths.length)

            var routeVariants = await db.query('SELECT rl.line AS "line", rl.variant AS "variant", rl.li_kuerzel AS "slug", rl.direction AS "direction" FROM data.rec_lid as rl WHERE rl.li_kuerzel = $1 ORDER BY 1 ASC, 2 ASC', [ routeSlug ])

            // console.log('  > Processing %d variants', routeVariants.rows.length)

            for (var variant in routeVariants.rows) {
                var routeVariant = routeVariants.rows[variant]

                var routeVariantDirection = String(routeVariant.direction) === '1' ? 'way' : 'return'

                var routeVariantPaths = routePaths.slice().map((segments) => {
                    return segments.slice().filter((segment) => segment.direction === routeVariantDirection)
                }).filter((segments) => segments.length > 0)

                var routeVariantStops = await db.query('SELECT ro.ort_nr AS "stop", ST_X(ST_Transform(ro.the_geom, 4326)) AS "lng", ST_Y(ST_Transform(ro.the_geom, 4326)) AS "lat" FROM data.lid_verlauf as lv JOIN data.rec_ort as ro ON lv.ort_nr = ro.ort_nr WHERE lv.line = $1 AND lv.variant = $2 ORDER BY lv.li_lfd_nr ASC', [ routeVariant.line, routeVariant.variant ])

                // console.log('  > Possible path candidates: %d', routeVariantPaths.length)
                // console.log('  > Processing variant with %d stops', routeVariantStops.rows.length)

                var routeVariantCandidates = []

                for (var path in routeVariantPaths) {
                    var routePath = routeVariantPaths[path]

                    var routeVariantCandidateDistance = 0
                    var routeVariantCandidateStops = []

                    for (var stop in routeVariantStops.rows) {
                        var routeVariantStop = routeVariantStops.rows[stop]

                        var nearestPoints = routePath.map((segment) => {
                            var nearestPoint = turf.nearestPointOnLine(
                                turf.lineString([segment.from, segment.to]),
                                turf.point([ routeVariantStop.lng, routeVariantStop.lat ])
                            )

                            return {
                                point: nearestPoint.geometry.coordinates,
                                segment: segment,
                                distance: nearestPoint.properties.dist
                            }
                        })

                        nearestPoints = _.sortBy(nearestPoints, 'distance')

                        var nearestPoint = nearestPoints[0]

                        routeVariantCandidateDistance += nearestPoint.distance

                        routeVariantCandidateStops.push(_.extend({}, routeVariantStop, {
                            distance: nearestPoint.distance,
                            segment: nearestPoint.segment,
                            point: nearestPoint.point
                        }))
                    }

                    // console.log('    > Computed match with distance %s', routeVariantCandidateDistance)

                    routeVariantCandidates.push({
                        distance: routeVariantCandidateDistance,
                        segments: routePath,
                        stops: routeVariantCandidateStops
                    })
                }

                routeVariantCandidates = _.sortBy(routeVariantCandidates, 'distance')

                if (routeVariantCandidates.length > 0) {
                    var bestRouteVariantCandidate = routeVariantCandidates[0]

                    // console.log('    > Best match with distance %s', bestRouteVariantCandidate.distance)

                    var stopPointStrings = {}

                    bestRouteVariantCandidate.stops.forEach((stop) => {
                        stopPointStrings[stop.segment.fromString + ':' + stop.segment.toString] = stop
                    })

                    var adjustedSegments = []

                    for (var i = 0; i < bestRouteVariantCandidate.segments.length; i++) {
                        var segment = bestRouteVariantCandidate.segments[i]
                        var key = segment.fromString + ':' + segment.toString

                        if (_.has(stopPointStrings, key)) {
                            var midpoint = stopPointStrings[key].point
                            var midpointString = '[' + midpoint[0] + ',' + midpoint[1] + ']'

                            adjustedSegments.push({
                                direction: segment.direction,
                                from: segment.from,
                                fromString: segment.fromString,
                                to: midpoint,
                                toString: midpointString
                            })

                            adjustedSegments.push({
                                direction: segment.direction,
                                from: midpoint,
                                fromString: midpointString,
                                to: segment.to,
                                toString: segment.toString
                            })
                        } else {
                            adjustedSegments.push(segment)
                        }
                    }

                    // console.log('    > Adjusted segments: %d (was %d)', adjustedSegments.length, bestRouteVariantCandidate.segments.length)

                    var segmentsByFromString = {}

                    adjustedSegments.forEach((segment) => {
                        segmentsByFromString[segment.fromString] = segment
                    })

                    var stopSegments = []
                    var routeVariantLineBuffer = []

                    for (var i = 0; i < (bestRouteVariantCandidate.stops.length - 1); i++) {
                        var lineBuffer = []

                        var fromPoint = bestRouteVariantCandidate.stops[i].point
                        var fromString = '[' + fromPoint[0] + ',' + fromPoint[1] + ']'
                        var toPoint = bestRouteVariantCandidate.stops[i + 1].point
                        var toString = '[' + toPoint[0] + ',' + toPoint[1] + ']'

                        var currentString = fromString

                        lineBuffer.push({
                            point: fromPoint,
                            pointString: fromString
                        })

                        if (routeVariantLineBuffer.length === 0) {
                            routeVariantLineBuffer.push({
                                point: fromPoint,
                                pointString: fromString
                            })
                        }

                        while (currentString !== toString) {
                            var nextSegment = segmentsByFromString[currentString]

                            if (!nextSegment) {
                                // TODO handle separately?
                            }

                            if (!nextSegment || lineBuffer.filter((item) => {
                                return item.pointString === nextSegment.toString
                            }).length > 0) {
                                break
                            }

                            currentString = nextSegment.toString

                            lineBuffer.push({
                                point: nextSegment.to,
                                pointString: nextSegment.toString
                            })

                            routeVariantLineBuffer.push({
                                point: nextSegment.to,
                                pointString: nextSegment.toString
                            })
                        }

                        // console.log('    > Stop-stop Line: %d', lineBuffer.length)

                        stopSegments.push({
                            from: bestRouteVariantCandidate.stops[i],
                            to: bestRouteVariantCandidate.stops[i + 1],
                            line: lineBuffer
                        })
                    }

                    if (routeVariantLineBuffer.length > 0) {
                        // console.log('  > Updating route color: %s', color)

                        var routeColor = Color(color)

                        await db.query("UPDATE data.line_colors SET red = $1, green = $2, blue = $3, hex = $4, hue = $5 WHERE line = $6;", [ routeColor.red(), routeColor.green(), routeColor.blue(), routeColor.hex().replace('#', ''), parseInt(routeColor.hue()), routeVariant.line ])

                        // console.log('  > Updating variant geometry: %d parts', routeVariantLineBuffer.length)

                        await db.query("UPDATE data.rec_lid SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + routeVariantLineBuffer.map((item) => {
                            return item.point[0] + ' ' + item.point[1]
                        }).join(',') + ")', 4326), 25832) WHERE line = $1 AND variant = $2;", [ routeVariant.line, routeVariant.variant ])

                        // console.log('  > Updating stop-to-stop geometries: %d stops', stopSegments.length)

                        for (var i = 0; i < stopSegments.length; i++) {
                            var stopSegment = stopSegments[i]

                            if (stopSegment.line.length < 2) {
                                continue
                            }

                            await db.query("UPDATE data.lid_verlauf SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + stopSegment.line.map((item) => {
                                return item.point[0] + ' ' + item.point[1]
                            }).join(',') + ")', 4326), 25832) WHERE line = $1 AND variant = $2 AND li_lfd_nr = $3;", [ routeVariant.line, routeVariant.variant, (i + 1) ])

                            await db.query("UPDATE data.ort_edges SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + stopSegment.line.map((item) => {
                                return item.point[0] + ' ' + item.point[1]
                            }).join(',') + ")', 4326), 25832) WHERE start_ort_nr = $1 AND end_ort_nr = $2;", [ stopSegment.from.stop, stopSegment.to.stop ])
                        }

                        await db.query("UPDATE data.lid_verlauf SET the_geom = NULL WHERE line = $1 AND variant = $2 AND li_lfd_nr = $3;", [ routeVariant.line, routeVariant.variant, stopSegments.length + 1 ])
                    } else {
                        // console.log('  > Invalid path/geometry')
                    }
                } else {
                    // console.log('  > Unable to find matching path')
                }
            }

            var serviceRoutes = await db.query('SELECT DISTINCT sv.service_id AS "service", sv.line_id AS "line" FROM data.rec_lid rl JOIN data.rec_srv_variant sv ON sv.line_id = rl.line AND sv.variant_id = rl.variant WHERE rl.li_kuerzel = $1 AND rl.the_geom IS NOT NULL', [ routeSlug ])

            for (var route in serviceRoutes.rows) {
                var serviceRoute = serviceRoutes.rows[route]

                try {
                    await db.query('UPDATE data.rec_srv_route SET the_geom = rvg.geom FROM ( SELECT ST_Union(ST_MakeValid(ST_SnapToGrid(rl.the_geom, 0.0001))) AS "geom" FROM data.rec_lid rl JOIN data.rec_srv_variant sv ON sv.line_id = rl.line AND sv.variant_id = rl.variant WHERE sv.service_id = $1 AND rl.line = $2 ) AS rvg WHERE service_id = $3 AND line_id = $4', [ serviceRoute.service, serviceRoute.line, serviceRoute.service, serviceRoute.line ])
                } catch (err) {
                    try {
                        await db.query('UPDATE data.rec_srv_route SET the_geom = rvg.geom FROM ( SELECT ST_Union(ST_Buffer(ST_SnapToGrid(rl.the_geom, 0.0001), 1e-5)) AS "geom" FROM data.rec_lid rl JOIN data.rec_srv_variant sv ON sv.line_id = rl.line AND sv.variant_id = rl.variant WHERE sv.service_id = $1 AND rl.line = $2 ) AS rvg WHERE service_id = $3 AND line_id = $4', [ serviceRoute.service, serviceRoute.line, serviceRoute.service, serviceRoute.line ])
                    } catch (anoterhErr) {
                        // noop
                    }
                }
            }
        }

        await db.end()
    }

};