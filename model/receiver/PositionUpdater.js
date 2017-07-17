'use strict';

const logger = require("../../util/logger");
const moment = require("moment");

module.exports = class PositionUpdater {

    static checkIfInternal(connection, tripId, feature) {
        logger.log(`checkIfInternal() trip=${tripId}`);

        return Promise.resolve(`
                SELECT variant
                FROM data.rec_frt
                WHERE trip = ${feature.properties.frt_fid}
            `)
            .then(sql => connection.query(sql))
            .then(result => {
                if (result.rowCount === 0) {
                    throw(`Trip '${feature.properties.frt_fid}' not found in 'data.rec_frt'`);
                }

                if (result.rows[0].variant >= 990) {
                    throw(`Internal trip: ${result.rows[0].variant}`);
                }
            })
    }

    static insertIntoDatabase(connection, tripId, feature) {
        logger.log(`insertIntoDatabase() trip=${tripId}`);

        return Promise.resolve(`
                SELECT COUNT(*) AS cnt FROM data.vehicle_positions
                WHERE trip=${feature.properties.frt_fid}
            `)
            .then(sql => connection.query(sql))
            .then(result => {
                if (result.rows[0].cnt > 0) {
                    logger.log(`Trip ${tripId} already in database, updating...`);

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
                        WHERE trip=${tripId}
                    `;
                } else {
                    logger.debug(`Trip ${tripId} not yet in database, inserting...`);

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
            .then(() => {
                logger.debug(`Inserted/Updated trip ${tripId}`);
            })
    }

    /*insertTravelTimes(frtFid) {
        let deleteOldSql = `DELETE FROM data.travel_times WHERE trip = ${frtFid}`;
        connection.query(deleteOldSql);

        let timeTableUtils = new TimeTableUtils();
        timeTableUtils.insertTravelTimes(frtFid);
    }*/
};
