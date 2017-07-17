'use strict';

const connection = require("../../database/database");

module.exports = class Courses {

    getCourses(stopId, limit) {
        return Promise.resolve(function () {
            let limitSql = '';

            // noinspection EqualityComparisonWithCoercionJS
            if (limit != null) {
                limitSql = `LIMIT ${limit}`;
            }

            return `
                SELECT
                rec_lid.line_name,
                    rec_frt.trip,
                    data.vdv_seconds_to_hhmm(frt_start + COALESCE(travel_time, 0) + COALESCE(delay_sec, 0)) AS bus_passes_at,
                COALESCE(delay_sec, 0)/60 AS delay_minutes,
                    mta.tagesart_text,
                    fahrtart_nr,
                    li_r,
                    li_g,
                    li_b
                    
                FROM data.lid_verlauf
                
                INNER JOIN data.rec_lid
                    ON lid_verlauf.line = rec_lid.line
                    AND lid_verlauf.variant = rec_lid.variant
                    
                INNER JOIN data.rec_frt
                    ON rec_lid.line = rec_frt.line
                    AND rec_lid.variant = rec_frt.variant
                    
                LEFT JOIN data.travel_times
                    ON travel_times.trip=rec_frt.trip
                    AND travel_times.li_lfd_nr_start=1
                    AND travel_times.li_lfd_nr_end=lid_verlauf.li_lfd_nr
                    
                LEFT JOIN data.vehicle_position_act
                    ON vehicle_position_act.trip=rec_frt.teq_nummer
                    
                LEFT JOIN data.menge_tagesart mta
                    ON rec_frt.tagesart_nr=mta.tagesart_nr
                    
                LEFT JOIN data.firmenkalender fkal
                    ON rec_frt.tagesart_nr=fkal.tagesart_nr
                    
                LEFT JOIN data.line_attributes
                    ON rec_frt.line=line_attributes.line
                    
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