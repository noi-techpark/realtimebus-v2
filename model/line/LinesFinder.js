'use strict';

module.exports = class LinesFinder {

    constructor(client) {
        this.client = client;
    }

    getAllLines(city) {
        return Promise.resolve()
            .then(() => {
                return `
                    SELECT
                        rec_frt.line AS li_nr,
                        rec_frt.variant::varchar AS str_li_var,
                        line_name AS lidname,
                        direction AS li_lfd_nr,
                        red AS li_r,
                        green AS li_g,
                        blue AS li_b
                    
                    FROM data.rec_frt
                    
                    LEFT JOIN data.rec_lid
                        ON rec_frt.line=rec_lid.line
                        AND rec_frt.variant=rec_lid.variant
                        
                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line
                        
                    WHERE rec_lid.li_kuerzel LIKE '%${city}%'
                    
                    GROUP BY rec_frt.line, rec_frt.variant, line_colors.line, line_name, direction
                    
                    ORDER BY li_nr
                `;
            })
            .then(sql => this.client.query(sql))
            .then(result => {
                return result.rows
            })
    }

    getActiveLines(timeHorizon, city) {
        return Promise.resolve()
            .then(() => {
                return `
                    SELECT
                        rec_frt.line AS li_nr,
                        rec_frt.variant::varchar AS str_li_var,
                        line_name AS lidname,
                        direction AS li_lfd_nr,
                        red AS li_r,
                        green AS li_g,
                        blue AS li_b
                    
                    LEFT JOIN data.rec_lid ON rec_frt.line=rec_lid.line AND rec_frt.variant=rec_lid.variant
                    
                    INNER JOIN data.menge_tagesart
                        ON rec_frt.day_type=menge_tagesart.day_type
                        
                    INNER JOIN data.firmenkalender
                        ON menge_tagesart.day_type=firmenkalender.day_type
                        
                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line
                        
                    WHERE betriebstag=to_char(CURRENT_TIMESTAMP, 'YYYYMMDD')::integer
                        AND CAST(CURRENT_DATE AS TIMESTAMP) AT TIME ZONE 'GMT+1' + departure * INTERVAL '1 seconds' > CURRENT_TIMESTAMP - INTERVAL '60 minutes'
                        AND CAST(CURRENT_DATE AS TIMESTAMP) AT TIME ZONE 'GMT+1' + departure * INTERVAL '1 seconds' < CURRENT_TIMESTAMP + INTERVAL '${timeHorizon} seconds'
                        AND rec_lid.li_kuerzel LIKE '%${city}%'
                        
                    GROUP BY rec_frt.line, rec_frt.variant, line_colors.line, line_name, direction
                    
                    ORDER BY li_nr
                `
            })
            .then(sql => this.client.query(sql))
            .then(result => {
                return result.rows
            })
    }
};