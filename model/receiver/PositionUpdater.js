'use strict';

const logger = require("../../util/logger");

module.exports.insertIntoDatabase = function (connection, trip, feature) {
    return Promise.resolve(`
            SELECT COUNT(*) AS cnt FROM data.vehicle_positions
            WHERE trip=${feature.properties.frt_fid}
        `)
        .then(sql => connection.query(sql))
        .then(result => {
            if (result.rows[0].cnt > 0) {
                logger.log(`Updating trip with TEQ ${trip}`);

                return `
                        UPDATE data.vehicle_positions SET
                            gps_date = '${feature.properties.gps_date}',
                            delay_sec = ${feature.properties.delay_sec},
                            line = ${feature.properties.line},
                            variant = ${feature.properties.variant},
                            li_lfd_nr = ${feature.properties.li_lfd_nr},
                            interpolation_distance = ${feature.properties.interpolation_distance},
                            interpolation_linear_ref = ${feature.properties.interpolation_linear_ref},
                            the_geom = ${feature.geometry_sql},
                            vehicle = SPLIT_PART('${feature.properties.vehicleCode}', ' ', 1)::int,
                            depot = SPLIT_PART('${feature.properties.vehicleCode}', ' ', 2)
                        WHERE trip=${trip}
                    `;
            } else {
                logger.log(`Inserting trip ${trip}`);

                return `
                        INSERT INTO data.vehicle_positions (
                            gps_date,
                            delay_sec,
                            trip,
                            line,
                            variant,
                            li_lfd_nr,
                            interpolation_distance,
                            interpolation_linear_ref,
                            the_geom,
                            vehicle,
                            depot
                        ) VALUES (
                            '${feature.properties.gps_date}',
                            ${feature.properties.delay_sec},
                            ${feature.properties.frt_fid},
                            ${feature.properties.line},
                            ${feature.properties.variant},
                            ${feature.properties.li_lfd_nr},
                            ${feature.properties.interpolation_distance},
                            ${feature.properties.interpolation_linear_ref},
                            ${feature.geometry_sql},
                            SPLIT_PART('${feature.properties.vehicleCode}', ' ', 1)::int,
                            SPLIT_PART('${feature.properties.vehicleCode}', ' ', 2)
                        )
                   `;
            }
        })
        .then(sql => connection.query(sql))
};
