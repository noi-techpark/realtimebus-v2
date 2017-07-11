'use strict';

const connection = require("../../../database/connection");
const logger = require("../../../util/logger");

module.exports = class ActualPositionLineReference {

    getLineReference(feature) {
        // TODO: WHERE rec_frt.teq_nummer = ${feature.properties.frt_fid}

        // TODO: Fix this error (Possibly already fixed?)
        // Error inserting trip NaN: Error: ERROR:  column "nan" does not exist
        // LINE 12: WHERE rec_frt.frt_fid = NaN

        return Promise.resolve(`
                SELECT
                    lid_verlauf.li_nr,
                    lid_verlauf.str_li_var,
                    lid_verlauf.li_lfd_nr,
                    ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql} ) as interpolation_distance,
                    ST_LineLocatePoint(lid_verlauf.the_geom, ${feature.geometry_sql}) as interpolation_linear_ref
                FROM vdv.rec_frt
                INNER JOIN vdv.lid_verlauf
                    ON rec_frt.li_nr = lid_verlauf.li_nr
                    AND rec_frt.str_li_var = lid_verlauf.str_li_var
                WHERE rec_frt.frt_fid = ${feature.properties.frt_fid}
                ORDER BY ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql})
                LIMIT 1
            `)
            .then(sql => connection.query(sql))
            .then(result => {
                if (result.rowCount === 0) {
                    logger.debug(`Trip ${feature.properties.frt_fid} does not yet exist in database`);

                    return {
                        li_nr: 'null',
                        str_li_var: null,
                        li_lfd_nr: 'null',
                        interpolation_distance: 'null',
                        interpolation_linear_ref: 'null',
                    };
                }

                let reference = result.rows[0];
                logger.log(`lineReferenceData='${reference}'`);

                return reference;
            });
    }
};
