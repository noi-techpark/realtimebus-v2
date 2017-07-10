'use strict';

const connection = require("../../../database/connection");
const logger = require("../../../util/logger");

class ActualPositionUpdater {

    checkIfInternal(tripId, feature) {
        return new Promise(function (resolve, reject) {
            let isInternalCourseSql = `
                    SELECT str_li_var
                    FROM vdv.rec_frt
                    WHERE frt_fid = ${feature.properties.frt_fid}
                `;

            connection.query(isInternalCourseSql, (err, res) => {
                if (err) return reject(err);

                if (res.rows[0].str_li_var >= 990) {
                    return reject("Internal trip");
                }

                resolve();
            });
        })
    }

    insertIntoDatabase(tripId, feature) {
        return new Promise(function (resolve, reject) {
            let frtExistsSql = `
                SELECT COUNT(*)  AS cnt FROM vdv.vehicle_position_act
                WHERE frt_fid=${feature.properties.frt_fid}
            `;

            connection.query(frtExistsSql, (err, res) => {
                if (err) return reject(err);

                if (res.rows[0].cnt >= 0) {
                    let mergeNewPos = `
                        UPDATE vdv.vehicle_position_act SET
                        gps_date  = '${feature.properties.gps_date}',
                            delay_sec = ${feature.properties.delay_sec},
                            li_nr = ${feature.properties.li_nr},
                            str_li_var = '${feature.propertiesstr_li_var}',
                            li_lfd_nr = ${feature.properties.li_lfd_nr},
                            interpolation_distance = ${feature.properties.interpolation_distance},
                            interpolation_linear_ref = ${feature.properties.interpolation_linear_ref},
                            the_geom  = ${feature.geometry_sql}
                        WHERE frt_fid=${tripId}
                    `;

                    connection.query(mergeNewPos, (err, res) => {
                        if (err) return reject(err);
                        return resolve();
                    });
                } else {
                    let mergeNewPos = `
                        INSERT INTO vdv.vehicle_position_act
                        (gps_date,
                            delay_sec,
                            frt_fid,
                            li_nr,
                            str_li_var,
                            li_lfd_nr,
                            interpolation_distance,
                            interpolation_linear_ref,
                            the_geom)
                        VALUES (
                            '${feature.properties.gps_date}',
                            ${feature.properties.delay_sec},
                            ${feature.properties.frt_fid},
                            ${feature.properties.li_nr},
                            '${feature.properties.str_li_var}',
                            ${feature.properties.li_lfd_nr},
                            ${feature.properties.interpolation_distance},
                            ${feature.properties.interpolation_linear_ref},
                            ${feature.geometry_sql})
                   `;

                    connection.query(mergeNewPos, (err, res) => {
                        if (err) return reject(err);
                        return resolve();
                    });
                }

                resolve();
            });
        })
    }


    insert(tripId, feature) {
        return new Promise(function (resolve, reject) {
            // TODO: What does this filter do?
            /*if ($filterValue != DataFilter::IS_OK) {
                return;
            }*/

            // TODO: Perform check
            /*if (empty($feature['properties']['frt_fid'])) {
                return;
            }*/

            resolve()
        })
            .then(this.checkIfInternal(tripId, feature))
            .then(this.insertIntoDatabase(tripId, feature))
    }

    insertTravelTimes(frtFid) {
        let deleteOldSql = `DELETE FROM vdv.travel_times WHERE frt_fid=${frtFid}`;
        await
        connection.query(deleteOldSql);

        let timeTableUtils = new TimeTableUtils();
        timeTableUtils.insertTravelTimes(frtFid);
    }

    execute(featureId, feature, filterValue) {
        // TODO: What does this filter do?
        /*if ($filterValue != DataFilter::IS_OK) {
            return;
        }*/

        // TODO: Perform check
        /*if (empty($feature['properties']['frt_fid'])) {
            return;
        }*/

        // do not copy data, if it is an internal course
    }
}