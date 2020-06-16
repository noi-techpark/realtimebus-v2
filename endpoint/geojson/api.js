const _ = require('underscore');
const fs = require('fs');
const moment = require('moment');
require('moment-timezone');
const Color = require('color');
const crypto = require('crypto');
const csv = require('csvtojson');
const dom = require('xmldom').DOMParser;
const { parseAsync } = require('json2csv');
const logger = require('../../util/logger');
const tj = require('@mapbox/togeojson');
const tk = require('@maphubs/tokml');
const turf = require('@turf/turf');
const utils = require('../../util/utils');
const vdv = require('../vdv/vdv');
const database = require('../../database/database');
const config = require('../../config');

var redirectToGtfs = (req, res, path) => {
    res
        .status(200)
        .send(fs.readFileSync(__dirname + '/../../static/gtfs/' + path));
};

var resolveAreaName = (shortName) => {
    if (shortName.endsWith(' BZ')) {
        return 'Bozen/Bolzano';
    }

    if (shortName.endsWith(' ME')) {
        return 'Meran/Merano';
    }

    return null;
};

module.exports = {

    importData: (req, res) => {
        let importPaths = async (client, mapping, paths, callback) => {
            let routeSlugs = (await client.query('SELECT DISTINCT rl.li_kuerzel AS "slug" FROM data.rec_lid as rl ORDER BY 1 ASC')).rows.map((row) => row.slug)

            for (var slug = 0; slug < routeSlugs.length; slug++) {
                let routeSlug = routeSlugs[slug]

                logger.info(`Generating paths for: ${routeSlug}`)

                let routeMappedPaths = mapping.filter((tuple) => tuple.Abbreviazione === routeSlug).map((tuple) => tuple.Teilstuecke)

                let routePaths = []

                routeMappedPaths.forEach((mappedPaths) => {
                    mappedPaths.forEach((mappedPath) => {
                        routePaths = [].concat(routePaths, paths.filter((path) => path.name === mappedPath))
                    })
                })

                let routeVariants = (await client.query('SELECT rl.line AS "line", rl.variant AS "variant", rl.li_kuerzel AS "slug", rl.direction AS "direction" FROM data.rec_lid as rl WHERE rl.li_kuerzel = $1 ORDER BY 1 ASC, 2 ASC', [ routeSlug ])).rows

                for (var variant = 0; variant < routeVariants.length; variant++) {
                    let routeVariant = routeVariants[variant]

                    let routeVariantStops = (await client.query('SELECT ro.ort_nr AS "stop", ST_X(ST_Transform(ro.the_geom, 4326)) AS "lng", ST_Y(ST_Transform(ro.the_geom, 4326)) AS "lat" FROM data.lid_verlauf as lv JOIN data.rec_ort as ro ON lv.ort_nr = ro.ort_nr WHERE lv.line = $1 AND lv.variant = $2 ORDER BY lv.li_lfd_nr ASC', [ routeVariant.line, routeVariant.variant ])).rows

                    if (routeVariantStops.length > 1) {
                        var routeCandidates = []

                        for (var path = 0; path < routePaths.length; path++) {
                            let pathLine = turf.lineString(routePaths[path].geometry)

                            var segments = []
                            var buffer = null

                            var queue = routePaths[path].geometry.slice()
                            var stops = routeVariantStops.map((stop) => [ stop.lng, stop.lat ])
                            var currentStop = stops.shift()

                            var lastPoint = queue.shift()
                            var stopPoint = turf.nearestPointOnLine(pathLine, turf.point(currentStop))

                            do {
                                let point = queue.shift()
                                let segment = turf.lineString([ lastPoint, point ])
                                let matchedPoint = turf.nearestPointOnLine(segment, stopPoint.geometry)

                                if (!buffer) {
                                    if (turf.booleanContains(segment, stopPoint.geometry) || matchedPoint.properties.dist <= 0.01) {
                                        queue = [].concat([ stopPoint.geometry.coordinates ], queue)

                                        buffer = {
                                            from: currentStop,
                                            fromDistance: stopPoint.properties.dist,
                                            to: null,
                                            toDistance: null,
                                            geometry: [ stopPoint.geometry.coordinates ]
                                        }

                                        currentStop = stops.shift()

                                        stopPoint = turf.nearestPointOnLine(pathLine, turf.point(currentStop))
                                    }
                                } else {
                                    if (turf.booleanContains(segment, stopPoint.geometry) || matchedPoint.properties.dist <= 0.01) {
                                        buffer.geometry.push(stopPoint.geometry.coordinates)

                                        buffer.to = currentStop
                                        buffer.toDistance = stopPoint.properties.dist

                                        queue = [].concat([ stopPoint.geometry.coordinates ], queue)

                                        segments.push(buffer)

                                        if (stops.length === 0) {
                                            break
                                        }

                                        buffer = {
                                            from: currentStop,
                                            fromDistance: stopPoint.properties.dist,
                                            to: null,
                                            toDistance: null,
                                            geometry: [ stopPoint.geometry.coordinates ]
                                        }

                                        currentStop = stops.shift()

                                        stopPoint = turf.nearestPointOnLine(pathLine, turf.point(currentStop))
                                    } else {
                                        buffer.geometry.push(point)
                                    }
                                }

                                lastPoint = point
                            } while (queue.length > 0)

                            if (segments.length === (routeVariantStops.length - 1)) {
                                var distances = []
                                distances = [].concat(distances, segments.map((s) => s.fromDistance))
                                distances = [].concat(distances, segments.map((s) => s.toDistance))

                                routeCandidates.push({
                                    distance: distances.reduce((a, b) => a + b, 0),
                                    path: routePaths[path],
                                    segments: segments.map((s) => s.geometry)
                                })
                            }
                        }

                        routeCandidates = _.sortBy(routeCandidates, 'distance')

                        var routeColor = Color('#000000')
                        var routeOverallLine = routeVariantStops.map((s) => [s.lng, s.lat])
                        var routeSegments = []

                        for (var i = 1; i < routeVariantStops.length; i++) {
                            let from = routeVariantStops[i - 1]
                            let to = routeVariantStops[i]
                            routeSegments.push([ [from.lng, from.lat], [to.lng, to.lat] ])
                        }

                        if (routeCandidates.length > 0) {
                            let routeCandidate = routeCandidates[0]

                            routeColor = Color(routeCandidate.path.color)
                            routeOverallLine = routeCandidate.path.geometry
                            routeSegments = routeCandidate.segments
                        }

                        await client.query("UPDATE data.line_colors SET red = $1, green = $2, blue = $3, hex = $4, hue = $5 WHERE line = $6;", [routeColor.red(), routeColor.green(), routeColor.blue(), routeColor.hex().replace('#', ''), parseInt(routeColor.hue()), routeVariant.line])

                        await client.query("UPDATE data.rec_lid SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + routeOverallLine.map((point) => point[0] + ' ' + point[1]).join(',') + ")', 4326), 25832) WHERE line = $1 AND variant = $2;", [routeVariant.line, routeVariant.variant])

                        let pathHash = crypto.createHash('md5').update(JSON.stringify(routeOverallLine)).digest('hex')

                        let matchingPaths = (await client.query("SELECT id FROM data.rec_path WHERE hash = $1", [pathHash])).rows

                        var pathID = 0

                        if (matchingPaths.length === 0) {
                            let insertedPath = await client.query("INSERT INTO data.rec_path (hash, the_geom) VALUES ($1, ST_Transform(ST_GeomFromText('LINESTRING(" + routeOverallLine.map((point) => point[0] + ' ' + point[1]).join(',') + ")', 4326), 25832)) RETURNING id;", [pathHash])
                            pathID = insertedPath.rows[0].id
                        } else {
                            pathID = matchingPaths[0].id
                        }

                        await client.query("UPDATE data.rec_vnt SET path_id = $1 WHERE line_id = $2 AND variant_id = $3;", [pathID, routeVariant.line, routeVariant.variant])

                        await client.query("UPDATE data.lid_verlauf SET the_geom = NULL WHERE line = $1 AND variant = $2 AND li_lfd_nr = $3;", [routeVariant.line, routeVariant.variant, routeVariantStops.length])

                        for (var i = 0; i < routeSegments.length; i++) {
                            let from = routeVariantStops[i]
                            let to = routeVariantStops[i + 1]
                            let segment = routeSegments[i]

                            await client.query("UPDATE data.lid_verlauf SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + segment.map((point) => point[0] + ' ' + point[1]).join(',') + ")', 4326), 25832) WHERE line = $1 AND variant = $2 AND li_lfd_nr = $3;", [routeVariant.line, routeVariant.variant, i])

                            await client.query("UPDATE data.ort_edges SET the_geom = ST_Transform(ST_GeomFromText('LINESTRING(" + segment.map((point) => point[0] + ' ' + point[1]).join(',') + ")', 4326), 25832) WHERE start_ort_nr = $1 AND end_ort_nr = $2;", [from.stop, to.stop])
                        }
                    } else {
                        await client.query("UPDATE data.rec_lid SET the_geom = NULL WHERE line = $1 AND variant = $2;", [routeVariant.line, routeVariant.variant])
                    }
                }
            }

            callback()
        }

        let augmentGtfsFiles = (client, callback) => {
            Promise.resolve()
                .then(() => {
                    return Promise.all([
                        csv({ delimiter: ',' }).fromFile(__dirname + '/../../static/gtfs/trips.txt'),
                        client.query("SELECT rf.trip, rv.path_id FROM data.rec_vnt rv JOIN data.rec_frt rf ON (rv.service_id = rf.day_type AND rv.line_id = rf.line AND rv.variant_id = rf.variant);"),
                        client.query("SELECT id, ST_AsGeoJSON(ST_Transform(the_geom, 4326)) AS geom FROM data.rec_path;")
                    ])
                })
                .then((results) => {
                    let trips = results[0]

                    var pathsForTrips = {}
                    results[1].rows.forEach((row) => {
                        pathsForTrips[parseInt(row.trip)] = row.path_id
                    })

                    var shapes = []
                    results[2].rows.forEach((row) => {
                        let id = parseInt(row.id)
                        let path = JSON.parse(row.geom)

                        for (var i = 0; i < path.coordinates.length; i++) {
                            shapes.push({
                                shape_id: id,
                                shape_pt_lat: path.coordinates[i][1],
                                shape_pt_lng: path.coordinates[i][0],
                                shape_pt_sequence: i
                            })
                        }
                    })

                    return Promise.all([
                        parseAsync(trips.map((trip) => _.extend({}, trip, {
                            shape_id: String(pathsForTrips[parseInt(trip.trip_id)] || "")
                        })), [].concat(_.keys(trips[0]), 'shape_id')),
                        parseAsync(shapes, ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence' ])
                    ])
                })
                .then((csvs) => {
                    fs.writeFileSync(__dirname + '/../../static/gtfs/trips.txt', csvs[0])
                    fs.writeFileSync(__dirname + '/../../static/gtfs/shapes.txt', csvs[1])
                })
                .then(() => {
                    callback()
                })
        }

        req.setTimeout(0)

        logger.info(`Generating paths/geometries...`)

        database.connect().then(client => {
            let payload = req.body

            if (!payload || !payload.data || !payload.geometries || !payload.geometries.mapping || !payload.geometries.paths) {
                res.status(400).send()
                return
            }

            if (typeof payload.data !== 'string' || typeof payload.geometries.mapping !== 'string' || typeof payload.geometries.paths !== 'string') {
                res.status(400).send()
                return
            }

            let mappingString = Buffer.from(payload.geometries.mapping, 'base64').toString('utf8')
            let pathsString = Buffer.from(payload.geometries.paths, 'base64').toString('utf8')

            var paths = tj.kml(new dom().parseFromString(pathsString))

            paths = paths.features.filter((route) => route.geometry.type === 'LineString').map((route) => {
                var geometry = route.geometry.coordinates.map((coord) => [ coord[0], coord[1] ])

                var normalizedGeometry = []

                geometry.forEach((point) => {
                    if (normalizedGeometry.length === 0) {
                        normalizedGeometry.push(point)
                    } else {
                        let lastPoint = normalizedGeometry[normalizedGeometry.length - 1]

                        if (lastPoint[0] !== point[0] || lastPoint[1] !== point[1]) {
                            normalizedGeometry.push(point)
                        }
                    }
                })

                return {
                    name: route.properties.name,
                    color: route.properties.stroke,
                    geometry: normalizedGeometry
                }
            })

            csv({
                delimiter: ';',
                colParser: {
                    'Teilstuecke': (item) => {
                        return _.map(item.split(','), (part) => part.trim())
                    }
                }
            }).fromString(mappingString).then((mapping) => {
                var warnings = []

                let referencedNames = _.uniq(_.flatten(mapping.map((tuple) => tuple.Teilstuecke)))
                let pathNames = paths.map((path) => path.name)

                referencedNames.forEach((name) => {
                    if (!_.contains(pathNames, name)) {
                        warnings.push(`The mapping (CSV) file contains a missing/non-existing path: '${name}'`)
                    }
                })

                let multipleEntries = _.filter(_.countBy(pathNames), (count) => count > 1)
                if (multipleEntries.length > 0) {
                    multipleEntries.forEach((entry, key) => warnings.push(`Detected non-unique path named: '${key}' in the KML file.`))
                }

                let pathsWithoutName = _.filter(paths, (path) => !path.name)
                if (pathsWithoutName.length > 0) {
                    warnings.push(`Detected one or more elements without <name/> in the KML file.`)
                }

                let pathsWithoutColor = _.filter(paths, (path) => !path.color)
                if (pathsWithoutColor.length > 0) {
                    warnings.push(`Detected one or more elements without <stroke/> (color) in the KML file.`)
                }

                vdv.process(Buffer.from(payload.data, 'base64'), {
                    finished: (response) => {
                        importPaths(client, mapping, paths, (err) => {
                            if (!!err) {
                                logger.error(err)

                                utils.respondWithError(res, err)
                                utils.handleError(err)

                                return
                            }

                            augmentGtfsFiles(client, (err) => {
                                client.release()

                                logger.info(`Generated paths/geometries for the existing routes!`)

                                res.status(200).json(_.extend({}, response, { warnings: warnings }))
                            })
                        })
                    },
                    failed: (error) => {
                        client.release()

                        utils.respondWithError(res, error, { warnings: warnings })
                        utils.handleError(error)
                    }
                })
            })
        })
    },

    getServices: (req, res) => {
        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT
                            rs.service_id AS "id",
                            rs.on_mondays AS "mon",
                            rs.on_tuesdays AS "tue",
                            rs.on_wednesdays AS "wed",
                            rs.on_thursdays AS "thu",
                            rs.on_fridays AS "fri",
                            rs.on_saturdays AS "sat",
                            rs.on_sundays AS "sun",
                            rs.start_date AS "start_date",
                            rs.end_date AS "end_date"
                        FROM data.rec_srv rs
                        ORDER BY rs.service_id ASC
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: row.id,
                            startDate: row.start_date,
                            endDate: row.end_date,
                            weekdays: {
                                monday: row.mon,
                                tuesday: row.tue,
                                wednesday: row.wed,
                                thursday: row.thu,
                                friday: row.fri,
                                saturday: row.sat,
                                sunday: row.sun
                            }
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getActiveServices: (req, res, date) => {
        let formattedDate = date.format('YYYY-MM-DD');

        var weekdayColumn = 'on_sundays';

        if (date.day() === 1) {
            weekdayColumn = 'on_mondays';
        }

        if (date.day() === 2) {
            weekdayColumn = 'on_tuesdays';
        }

        if (date.day() === 3) {
            weekdayColumn = 'on_wednesdays';
        }

        if (date.day() === 4) {
            weekdayColumn = 'on_thursdays';
        }

        if (date.day() === 5) {
            weekdayColumn = 'on_fridays';
        }

        if (date.day() === 6) {
            weekdayColumn = 'on_saturdays';
        }

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT
                            rs.service_id AS "id",
                            rs.on_mondays AS "mon",
                            rs.on_tuesdays AS "tue",
                            rs.on_wednesdays AS "wed",
                            rs.on_thursdays AS "thu",
                            rs.on_fridays AS "fri",
                            rs.on_saturdays AS "sat",
                            rs.on_sundays AS "sun",
                            rs.start_date AS "start_date",
                            rs.end_date AS "end_date"
                        FROM data.rec_srv rs
                        WHERE (
                            rs.start_date <= '${formattedDate}' AND
                            rs.end_date >= '${formattedDate}' AND
                            rs.${weekdayColumn} = true AND
                            NOT EXISTS (
                                SELECT *
                                FROM data.rec_srv_date rsd
                                WHERE rsd.service_id = rs.service_id
                                    AND rsd.the_date = '${formattedDate}'
                                    AND rsd.is_added = FALSE
                            )
                        ) OR EXISTS (
                            SELECT *
                            FROM data.rec_srv_date rsd
                            WHERE rsd.service_id = rs.service_id
                                AND rsd.the_date = '${formattedDate}'
                                AND rsd.is_added = TRUE
                        )
                        ORDER BY rs.service_id ASC
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: row.id,
                            startDate: row.start_date,
                            endDate: row.end_date,
                            weekdays: {
                                monday: row.mon,
                                tuesday: row.tue,
                                wednesday: row.wed,
                                thursday: row.thu,
                                friday: row.fri,
                                saturday: row.sat,
                                sunday: row.sun
                            }
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getActiveServicesForToday: (req, res) => {
        let self = module.exports;
        self.getActiveServices(req, res, moment());
    },

    getActiveServicesForDate: (req, res) => {
        let self = module.exports;

        if (!!req.params.date) {
            self.getActiveServices(req, res, moment(req.params.date));
        } else {
            res.status(400);
        }
    },

    getRoutes: (req, res) => {
        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rl.line AS "id",
                            rl.line_name AS "short_name",
                            rl.li_kuerzel AS "long_name",
                            LOWER(lc.hex) AS "color"
                        FROM data.line_colors as lc
                        JOIN data.rec_lid as rl ON lc.line = rl.line
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.id),
                            color: '#' + row.color,
                            shortName: row.short_name,
                            longName: row.long_name,
                            areaName: resolveAreaName(row.long_name),
                            agencyId: 101,
                            type: 3
                        }
                    }));

                    client.release();
                }).catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getRoutesByService: (req, res) => {
        let serviceID = parseInt(req.params.serviceID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rl.line AS "id",
                            rl.line_name AS "short_name",
                            rl.li_kuerzel AS "long_name",
                            LOWER(lc.hex) AS "color"
                        FROM data.line_colors as lc
                        JOIN data.rec_lid as rl ON lc.line = rl.line
                        JOIN data.rec_vnt rv ON rl.line = rv.line_id AND rv.service_id = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.id),
                            color: '#' + row.color,
                            shortName: row.short_name,
                            longName: row.long_name,
                            areaName: resolveAreaName(row.long_name),
                            agencyId: 101,
                            type: 3
                        }
                    }));

                    client.release();
                }).catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getRoute: (req, res) => {
        let routeID = parseInt(req.params.routeID);

        database.connect().then(client => {
            return Promise.all([

                Promise.resolve()
                    .then(() => {
                        return `
                            SELECT DISTINCT
                                rl.line AS "id",
                                rl.line_name AS "short_name",
                                rl.li_kuerzel AS "long_name",
                                LOWER(lc.hex) AS "color"
                            FROM data.line_colors as lc
                            JOIN data.rec_lid as rl ON lc.line = rl.line
                            WHERE rl.line = ${routeID}
                        `;
                    })
                    .then(sql => {
                        return client.query(sql);
                    })
                    .then(result => {
                        if (result.rows.length === 1) {
                            let row = result.rows[0];

                            return Promise.resolve({
                                id: parseInt(row.id),
                                color: '#' + row.color,
                                shortName: row.short_name,
                                longName: row.long_name,
                                areaName: resolveAreaName(row.long_name),
                                agencyId: 101,
                                type: 3
                            });
                        } else {
                            return Promise.resolve(null);
                        }
                    }),

                Promise.resolve()
                    .then(() => {
                        return `
                            SELECT *
                            FROM data.rec_vnt rv
                            WHERE rv.line_id = ${routeID}
                            ORDER BY rv.service_id ASC, rv.variant_id ASC
                        `;
                    })
                    .then(sql => {
                        return client.query(sql);
                    })
                    .then(result => {
                        return Promise.resolve(result.rows);
                    }),

                Promise.resolve()
                    .then(() => {
                        return `
                            SELECT rv.id AS "id", ST_AsGeoJSON(ST_Transform(rp.the_geom, 4326)) AS "geom"
                            FROM data.rec_vnt rv
                            JOIN data.rec_path rp ON rv.path_id = rp.id
                            WHERE rv.line_id = ${routeID} AND rp.the_geom IS NOT NULL
                        `;
                    })
                    .then(sql => {
                        return client.query(sql);
                    })
                    .then(result => {
                        return Promise.resolve(result.rows);
                    })

            ]).then((results) => {
                let trip = results[0];
                let variants = results[1];
                let paths = results[2];

                var sql = `
                    SELECT
                        lv.variant AS "variant_id",
                        ro.ort_nr AS "stop_id",
                        ro.ort_name AS "stop_name",
                        ST_Y(ST_Transform(ro.the_geom, 4326)) AS "stop_lat",
                        ST_X(ST_Transform(ro.the_geom, 4326)) AS "stop_lon"
                    FROM data.lid_verlauf lv
                    JOIN data.rec_ort as ro ON lv.ort_nr = ro.ort_nr
                    WHERE lv.line = ${routeID}
                    ORDER BY lv.variant ASC, lv.li_lfd_nr ASC
                `;

                client.query(sql, (err, result) => {
                    res.status(200).json(_.extend({}, trip, {
                        services: variants.map((row) => {
                            var geometry = null

                            if (paths.filter((pathsRow) => pathsRow.id === row.id).length === 1) {
                                geometry = {
                                    geojson: '/v2/variants/' + row.id + '.geojson',
                                    kml: '/v2/variants/' + row.id + '.kml'
                                };
                            }

                            return {
                                id: row.id,
                                serviceId: row.service_id,
                                geometry: geometry,
                                stops: result.rows
                                    .filter((stopRow) => row.variant_id === stopRow.variant_id)
                                    .map((stopRow) => {
                                        return {
                                            id: stopRow.stop_id,
                                            name: stopRow.stop_name,
                                            latitude: stopRow.stop_lat,
                                            longitude: stopRow.stop_lon,
                                        };
                                    })
                            };
                        })
                    }));

                    client.release();
                });
            }).catch(error => {
                logger.error(error);
                utils.respondWithError(res, error);
                utils.handleError(error);

                client.release();
            });
        });
    },

    getVariantGeometryAsGeoJSON: (req, res) => {
        let variantID = parseInt(req.params.variantID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT ST_AsGeoJSON(ST_Transform(rp.the_geom, 4326)) AS "geom"
                        FROM data.rec_vnt rv
                        JOIN data.rec_path rp ON rv.path_id = rp.id
                        WHERE rv.id = ${variantID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1 && !!result.rows[0].geom) {
                        res.status(200).json(JSON.parse(result.rows[0].geom));
                    } else {
                        res.status(404).send();
                    }

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getVariantGeometryAsKML: (req, res) => {
        let variantID = parseInt(req.params.variantID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT ST_AsGeoJSON(ST_Transform(rp.the_geom, 4326)) AS "geom"
                        FROM data.rec_vnt rv
                        JOIN data.rec_path rp ON rv.path_id = rp.id
                        WHERE rv.id = ${variantID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1 && !!result.rows[0].geom) {
                        res.status(200)
                            .header('Content-Type', 'application/vnd.google-earth.kml+xml')
                            .end(tk(JSON.parse(result.rows[0].geom)));
                    } else {
                        res.status(404).send();
                    }

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getTrips: (req, res) => {
        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rf.trip AS "trip_id",
                            rf.line AS "route_id",
                            rl.line_name AS "route_short_name",
                            rl.li_kuerzel AS "route_long_name",
                            LOWER(lc.hex) AS "route_color",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        JOIN data.rec_lid as rl ON rf.line = rl.line
                        JOIN data.line_colors lc ON lc.line = rl.line
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            route: {
                                id: parseInt(row.route_id),
                                color: '#' + row.route_color,
                                shortName: row.route_short_name,
                                longName: row.route_long_name,
                                areaName: resolveAreaName(row.route_long_name)
                            },
                            variantId: parseInt(row.variant_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getTripsByRoute: (req, res) => {
        let routeID = parseInt(req.params.routeID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rf.trip AS "trip_id",
                            rf.line AS "route_id",
                            rl.line_name AS "route_short_name",
                            rl.li_kuerzel AS "route_long_name",
                            LOWER(lc.hex) AS "route_color",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        JOIN data.rec_lid as rl ON rf.line = rl.line
                        JOIN data.line_colors lc ON lc.line = rl.line
                        WHERE rf.line = ${routeID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            route: {
                                id: parseInt(row.route_id),
                                color: '#' + row.route_color,
                                shortName: row.route_short_name,
                                longName: row.route_long_name,
                                areaName: resolveAreaName(row.route_long_name)
                            },
                            variantId: parseInt(row.variant_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getTripsByService: (req, res) => {
        let serviceID = parseInt(req.params.serviceID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rf.trip AS "trip_id",
                            rf.line AS "route_id",
                            rl.line_name AS "route_short_name",
                            rl.li_kuerzel AS "route_long_name",
                            LOWER(lc.hex) AS "route_color",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        JOIN data.rec_lid as rl ON rf.line = rl.line
                        JOIN data.line_colors lc ON lc.line = rl.line
                        WHERE rf.day_type = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            route: {
                                id: parseInt(row.route_id),
                                color: '#' + row.route_color,
                                shortName: row.route_short_name,
                                longName: row.route_long_name,
                                areaName: resolveAreaName(row.route_long_name)
                            },
                            variantId: parseInt(row.variant_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getTripsByRouteAndService: (req, res) => {
        let routeID = parseInt(req.params.routeID);
        let serviceID = parseInt(req.params.serviceID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT DISTINCT
                            rf.trip AS "trip_id",
                            rf.line AS "route_id",
                            rl.line_name AS "route_short_name",
                            rl.li_kuerzel AS "route_long_name",
                            LOWER(lc.hex) AS "route_color",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        JOIN data.rec_lid as rl ON rf.line = rl.line
                        JOIN data.line_colors lc ON lc.line = rl.line
                        WHERE rf.line = ${routeID} AND rf.day_type = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            route: {
                                id: parseInt(row.route_id),
                                color: '#' + row.route_color,
                                shortName: row.route_short_name,
                                longName: row.route_long_name,
                                areaName: resolveAreaName(row.route_long_name)
                            },
                            variantId: parseInt(row.variant_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getTrip: (req, res) => {
        let tripID = parseInt(req.params.tripID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT
                            rf.trip AS "trip_id",
                            rl.line AS "route_id",
                            rl.line_name AS "route_short_name",
                            rl.li_kuerzel AS "route_long_name",
                            LOWER(lc.hex) AS "route_color",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        JOIN data.rec_lid as rl ON rl.line = rf.line AND rl.variant = rf.variant
                        JOIN data.line_colors lc ON lc.line = rf.line
                        WHERE rf.trip = ${tripID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1) {
                        let row = result.rows[0];

                        var sql = `
                            SELECT
                                ro.ort_nr AS "stop_id",
                                ro.ort_name AS "stop_name",
                                ST_Y(ST_Transform(ro.the_geom, 4326)) AS "stop_lat",
                                ST_X(ST_Transform(ro.the_geom, 4326)) AS "stop_lon",
                                st.arrival_time AS "arrival_time",
                                st.departure_time AS "departure_time"
                            FROM data.lid_verlauf lv
                            JOIN data.rec_ort as ro ON lv.ort_nr = ro.ort_nr
                            JOIN (
                                (
                                    SELECT
                                        rf.trip AS "trip_id",
                                        lv.ort_nr AS "stop_id",
                                        (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                        (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                        0 AS "stop_sequence"
                                    FROM data.rec_frt as rf
                                    JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                                )
                                UNION ALL
                                (
                                    SELECT
                                        rf.trip AS "trip_id",
                                        lv.ort_nr AS "stop_id",
                                        ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                        ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                        tt.li_lfd_nr_end - 1 AS "stop_sequence"
                                    FROM data.rec_frt as rf
                                    JOIN data.travel_times tt ON tt.trip = rf.trip
                                    JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                                )
                            ) st ON (st.trip_id = ${row.trip_id} AND st.stop_id = ro.ort_nr)
                            WHERE lv.line = ${row.route_id} AND lv.variant = ${row.variant_id}
                            ORDER BY lv.li_lfd_nr ASC
                        `;

                        client.query(sql, (err, result) => {
                            res.status(200).json({
                                id: parseInt(row.trip_id),
                                route: {
                                    id: parseInt(row.route_id),
                                    color: '#' + row.route_color,
                                    shortName: row.route_short_name,
                                    longName: row.route_long_name,
                                    areaName: resolveAreaName(row.route_long_name)
                                },
                                serviceId: parseInt(row.service_id),
                                stops: result.rows.map((row) => {
                                    return {
                                        id: parseInt(row.stop_id),
                                        name: row.stop_name,
                                        latitude: row.stop_lat,
                                        longitude: row.stop_lon,
                                        arrivalTime: row.arrival_time,
                                        departureTime: row.departure_time
                                    };
                                })
                            });

                            client.release();
                        });
                    } else {
                        res.status(404).send();

                        client.release();
                    }
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStops: (req, res) => {
        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT
                            ro.ort_nr AS "stop_id",
                            ro.ort_name AS "stop_name",
                            ST_Y(ST_Transform(ro.the_geom, 4326)) AS "stop_lat",
                            ST_X(ST_Transform(ro.the_geom, 4326)) AS "stop_lon"
                        FROM data.rec_ort as ro
                        ORDER BY ro.ort_nr ASC
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.stop_id),
                            name: row.stop_name,
                            latitude: row.stop_lat,
                            longitude: row.stop_lon
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStop: (req, res) => {
        let stopID = parseInt(req.params.stopID)

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT
                            ro.ort_nr AS "stop_id",
                            ro.ort_name AS "stop_name",
                            ST_Y(ST_Transform(ro.the_geom, 4326)) AS "stop_lat",
                            ST_X(ST_Transform(ro.the_geom, 4326)) AS "stop_lon"
                        FROM data.rec_ort as ro
                        WHERE ro.ort_nr = ${stopID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1) {
                        let row = result.rows[0];

                        res.status(200).json({
                            id: parseInt(row.stop_id),
                            name: row.stop_name,
                            latitude: row.stop_lat,
                            longitude: row.stop_lon
                        });
                    } else {
                        res.status(404).send();
                    }
                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopTimes: (req, res) => {
        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopAfter: (req, res) => {
        let afterTime = req.params.afterTime;

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                            WHERE (rf.departure * INTERVAL '1 sec')::text > '${afterTime}'
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                            WHERE ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text > '${afterTime}'
                            ORDER BY rf.trip ASC, tt.li_lfd_nr_end ASC
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopTimesByStop: (req, res) => {
        let stopID = parseInt(req.params.stopID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                            WHERE lv.ort_nr = ${stopID}
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                            WHERE lv.ort_nr = ${stopID}
                            ORDER BY rf.trip ASC, tt.li_lfd_nr_end ASC
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopTimesByStopAfter: (req, res) => {
        let stopID = parseInt(req.params.stopID);
        let afterTime = req.params.afterTime;

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                            WHERE lv.ort_nr = ${stopID} AND (rf.departure * INTERVAL '1 sec')::text > '${afterTime}'
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                            WHERE lv.ort_nr = ${stopID} AND ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text > '${afterTime}'
                            ORDER BY rf.trip ASC, tt.li_lfd_nr_end ASC
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopTimesByTrip: (req, res) => {
        let tripID = parseInt(req.params.tripID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                            WHERE rf.trip = ${tripID}
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                            WHERE rf.trip = ${tripID}
                            ORDER BY tt.li_lfd_nr_end ASC
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    getStopTimesByTripAfter: (req, res) => {
        let tripID = parseInt(req.params.tripID);
        let afterTime = req.params.afterTime;

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                (rf.departure * INTERVAL '1 sec')::text AS "arrival_time",
                                (rf.departure * INTERVAL '1 sec')::text AS "departure_time",
                                0 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = 1
                            WHERE rf.trip = ${tripID} AND (rf.departure * INTERVAL '1 sec')::text >= '${afterTime}'
                        )
                        UNION ALL
                        (
                            SELECT
                                rf.trip AS "trip_id",
                                rf.day_type AS "service_id",
                                lv.ort_nr AS "stop_id",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "arrival_time",
                                ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text AS "departure_time",
                                tt.li_lfd_nr_end - 1 AS "stop_sequence"
                            FROM data.rec_frt as rf
                            JOIN data.travel_times tt ON tt.trip = rf.trip
                            JOIN data.lid_verlauf lv ON rf.line = lv.line AND rf.variant = lv.variant AND lv.li_lfd_nr = (tt.li_lfd_nr_end) AND tt.li_lfd_nr_end > 1
                            WHERE rf.trip = ${tripID} AND ((rf.departure + tt.travel_time) * INTERVAL '1 sec')::text >= '${afterTime}'
                            ORDER BY tt.li_lfd_nr_end ASC
                        )
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            serviceId: row.service_id,
                            stopId: row.stop_id,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    utils.handleError(error);

                    client.release();
                });
        });
    },

    gtfs: {

        getAgency: (req, res) => {
            redirectToGtfs(req, res, 'agency.txt')
        },

        getCalendar: (req, res) => {
            redirectToGtfs(req, res, 'calendar.txt')
        },

        getCalendarDates: (req, res) => {
            redirectToGtfs(req, res, 'calendar_dates.txt')
        },

        getRoutes: (req, res) => {
            redirectToGtfs(req, res, 'routes.txt')
        },

        getStops: (req, res) => {
            redirectToGtfs(req, res, 'stops.txt')
        },

        getStopTimes: (req, res) => {
            redirectToGtfs(req, res, 'stop_times.txt')
        },

        getTrips: (req, res) => {
            redirectToGtfs(req, res, 'trips.txt')
        }

    }

}