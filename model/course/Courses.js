'use strict';

const connection = require("../../database/database");

module.exports.getCourses = function (stopId, limit) {
    return Promise.resolve()
        .then(() => {
            let limitSql = '';

            // noinspection EqualityComparisonWithCoercionJS
            if (limit != null) {
                limitSql = `LIMIT ${limit}`;
            }

            return `
                    SELECT
                        rec_lid.line_name AS lidname,
                        rec_frt.trip AS frt_fid,
                        SUBSTRING(((departure + COALESCE(travel_time, 0) + COALESCE(delay_sec, 0)) * interval '1 sec')::text, 0, 6) AS bus_passes_at,
                        COALESCE(delay_sec, 0) / 60 AS delay_minutes,
                        mta.tagesart_text,
                        trip_type,
                        red,
                        green,
                        blue
                        
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
                        
                    LEFT JOIN data.vehicle_positions
                        ON vehicle_positions.trip=rec_frt.teq
                        
                    LEFT JOIN data.menge_tagesart mta
                        ON rec_frt.day_type=mta.day_type
                        
                    LEFT JOIN data.firmenkalender fkal
                        ON rec_frt.day_type=fkal.day_type
                        
                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line
                        
                    WHERE ort_nr=${stopId.ort_nr}
                        AND onr_typ_nr=${stopId.onr_typ_nr}
                        AND betriebstag=to_char(CURRENT_TIMESTAMP, 'YYYYMMDD')::integer
                        AND departure > EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE))
                        
                    ORDER BY bus_passes_at
                    ${limitSql}
                `;
        })
        .then(sql => connection.query(sql))
        .then(result => {
            return result.rows
        });
};