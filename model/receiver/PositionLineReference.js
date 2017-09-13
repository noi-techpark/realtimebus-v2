'use strict';

const logger = require("../../util/logger");

module.exports.getLineInfo = function (client, feature) {
    return Promise.resolve(`
                SELECT
                    lid_verlauf.line,
                    lid_verlauf.variant,
                    lid_verlauf.li_lfd_nr,
                    ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql} ) as interpolation_distance,
                    ST_LineLocatePoint(lid_verlauf.the_geom, ${feature.geometry_sql}) as interpolation_linear_ref
                    
                FROM data.rec_frt
                
                INNER JOIN data.lid_verlauf
                    ON rec_frt.line = lid_verlauf.line
                    AND rec_frt.variant = lid_verlauf.variant
                    
                WHERE rec_frt.teq = ${feature.properties.frt_fid}
                
                ORDER BY ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql})
                
                LIMIT 1
            `)
        .then(sql => client.query(sql))
        .then(result => {
            if (result.rowCount === 0) {
                logger.warn(`Trip ${feature.properties.frt_fid} does not exist in database`);

                return {
                    line: null,
                    variant: null,
                    li_lfd_nr: null,
                    interpolation_distance: null,
                    interpolation_linear_ref: null,
                };
            }

            return result.rows[0];
        });
};
