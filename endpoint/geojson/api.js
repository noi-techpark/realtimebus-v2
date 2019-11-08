const _ = require("underscore");
const fs = require("fs");
const moment = require("moment");
require("moment-timezone");
const database = require("../../database/database");
const config = require("../../config");

var redirectToGtfs = (req, res, path) => {
    res
        .status(200)
        .send(fs.readFileSync(__dirname + '/../../static/gtfs/' + path));
};

module.exports = {

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
                        WHERE
                            rs.start_date <= '${formattedDate}' AND
                            rs.end_date >= '${formattedDate}' AND
                            rs.${weekdayColumn} = true
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
                            agencyId: 101,
                            type: 3
                        }
                    }));

                    client.release();
                }).catch(error => {
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
                        JOIN data.rec_srv_route rsr ON rl.line = rsr.line_id AND rsr.service_id = ${serviceID}
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
                            agencyId: 101,
                            type: 3
                        }
                    }));

                    client.release();
                }).catch(error => {
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
                            FROM data.rec_srv_variant rsv
                            WHERE rsv.line_id = ${routeID}
                            ORDER BY rsv.service_id ASC, rsv.variant_id ASC
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
                            return {
                                serviceId: row.service_id,
                                variantId: row.variant_id,
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
                client.release();
            });
        });
    },

    getRouteGeometry: (req, res) => {
        let routeID = parseInt(req.params.routeID);
        let serviceID = parseInt(req.params.serviceID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT ST_AsGeoJSON(ST_Transform(rsr.the_geom, 4326)) AS "geom"
                        FROM data.rec_srv_route as rsr
                        WHERE rsr.line_id = ${routeID} AND rsr.service_id = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1 && !!result.rows[0].geom) {
                        res.status(200).json(JSON.parse(result.rows[0].geom));
                    } else {
                        res.send(404);
                    }

                    client.release();
                })
                .catch(error => {
                    client.release();
                });
        });
    },

    getRouteVariantGeometry: (req, res) => {
        let routeID = parseInt(req.params.routeID);
        let serviceID = parseInt(req.params.serviceID);
        let variantID = parseInt(req.params.variantID);

        database.connect().then(client => {
            return Promise.resolve()
                .then(() => {
                    return `
                        SELECT ST_AsGeoJSON(ST_Transform(rl.the_geom, 4326)) AS "geom"
                        FROM data.rec_lid rl
                        JOIN data.rec_srv_variant rsv ON (rl.line = rsv.line_id AND rl.variant = rsv.variant_id)
                        WHERE rl.line = ${routeID} AND rl.variant = ${variantID} AND rsv.service_id = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    if (result.rows.length === 1 && !!result.rows[0].geom) {
                        res.status(200).json(JSON.parse(result.rows[0].geom));
                    } else {
                        res.send(404);
                    }

                    client.release();
                })
                .catch(error => {
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
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            routeId: parseInt(row.route_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
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
                            routeId: parseInt(row.route_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
                        WHERE rf.service = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            routeId: parseInt(row.route_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            rf.service AS "service_id"
                        FROM data.rec_frt as rf
                        WHERE rf.line = ${routeID} AND rf.service = ${serviceID}
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            id: parseInt(row.trip_id),
                            routeId: parseInt(row.route_id),
                            serviceId: parseInt(row.service_id)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            rf.line AS "route_id",
                            rf.variant AS "variant_id",
                            rf.day_type AS "service_id"
                        FROM data.rec_frt as rf
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
                                routeId: parseInt(row.route_id),
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
                        res.status(404);

                        client.release();
                    }
                })
                .catch(error => {
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
                        res.status(404);
                    }
                    client.release();
                })
                .catch(error => {
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
                    `;
                })
                .then(sql => {
                    return client.query(sql);
                })
                .then(result => {
                    res.status(200).json(result.rows.map(row => {
                        return {
                            tripId: parseInt(row.trip_id),
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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
                            stopId: row.stop_name,
                            arrivalTime: row.arrival_time,
                            departureTime: row.departure_time,
                            sequence: parseInt(row.stop_sequence)
                        }
                    }));

                    client.release();
                })
                .catch(error => {
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