'use strict';

const connection = require("../../database/database");

module.exports = class CourseFinder {

    getCourses(stopId, limit) {
        return Promise.resolve(function () {
            let limitSql = '';

            // noinspection EqualityComparisonWithCoercionJS
            if (limit != null) {
                limitSql = `LIMIT ${limit}`;
            }

            return `
                SELECT
                rec_lid.lidname,
                    rec_frt.frt_fid,
                    data.vdv_seconds_to_hhmm(frt_start + COALESCE(travel_time, 0) + COALESCE(delay_sec, 0)) AS bus_passes_at,
                COALESCE(delay_sec, 0)/60 AS delay_minutes,
                    mta.tagesart_text,
                    fahrtart_nr,
                    li_r,
                    li_g,
                    li_b
                    
                FROM data.lid_verlauf
                
                INNER JOIN data.rec_lid
                    ON lid_verlauf.li_nr = rec_lid.li_nr
                    AND lid_verlauf.str_li_var = rec_lid.str_li_var
                    
                INNER JOIN data.rec_frt
                    ON rec_lid.li_nr = rec_frt.li_nr
                    AND rec_lid.str_li_var = rec_frt.str_li_var
                    
                LEFT JOIN data.travel_times
                    ON travel_times.frt_fid=rec_frt.frt_fid
                    AND travel_times.li_lfd_nr_start=1
                    AND travel_times.li_lfd_nr_end=lid_verlauf.li_lfd_nr
                    
                LEFT JOIN data.vehicle_position_act
                    ON vehicle_position_act.frt_fid=rec_frt.teq_nummer
                    
                LEFT JOIN data.menge_tagesart mta
                    ON rec_frt.tagesart_nr=mta.tagesart_nr
                    
                LEFT JOIN data.firmenkalender fkal
                    ON rec_frt.tagesart_nr=fkal.tagesart_nr
                    
                LEFT JOIN data.line_attributes
                    ON rec_frt.li_nr=line_attributes.li_nr
                    
                WHERE ort_nr=${stopId.ort_nr}
                    AND onr_typ_nr=${stopId.onr_typ_nr}
                    AND betriebstag=to_char(CURRENT_TIMESTAMP, 'YYYYMMDD')::integer
                    AND frt_start > EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE))
                    
                ORDER BY bus_passes_at
                ${limitSql}
            `;

            /*
                AND frt_start > date_part('hour', CURRENT_TIMESTAMP) * 3600 +
                date_part('minute', CURRENT_TIMESTAMP) * 60 +
                date_part('second', CURRENT_TIMESTAMP)
             */
        })
            .then(sql => connection.query(sql))
            .then(result => {
                return result.rows
            });
    }
};