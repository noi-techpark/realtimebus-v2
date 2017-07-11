'use strict';

const connection = require("../../database/connection");

const FeatureList = require("./FeatureList");
const LineUtils = require("./LineUtils");

module.exports = class StopFinder {

    constructor(outputFormat) {
        this.outputFormat = outputFormat;
    }

    setLines(lines) {
        this.lines = lines;
    }

    getNextStops(tripId) {
        return Promise.resolve(`
            SELECT rec_ort.onr_typ_nr,
                lid_verlauf.li_lfd_nr,
                rec_ort.ort_nr,
                rec_ort.ort_name,
                rec_ort.ort_ref_ort_name,
                COALESCE(vpa.delay_sec, 0) delay_sec,
                vdv.vdv_seconds_to_hhmm(frt_start + COALESCE(travel_time, 0) + COALESCE(delay_sec, 0)) AS time_est,
                li_ri_nr,
                ST_AsGeoJSON(rec_ort.the_geom) as json_geom
                
            FROM vdv.vehicle_position_act vpa
            
            INNER JOIN vdv.rec_frt
                ON rec_frt.teq_nummer=vpa.frt_fid
                
            INNER JOIN vdv.rec_lid
                ON rec_frt.li_nr=rec_lid.li_nr
                AND rec_frt.str_li_var=rec_lid.str_li_var
                
            INNER JOIN vdv.lid_verlauf
                ON rec_frt.li_nr=lid_verlauf.li_nr
                AND rec_frt.str_li_var=lid_verlauf.str_li_var
                AND vpa.li_lfd_nr < lid_verlauf.li_lfd_nr
                
            LEFT JOIN vdv.travel_times
                ON lid_verlauf.li_lfd_nr = li_lfd_nr_end
                AND travel_times.frt_fid=rec_frt.frt_fid
                
            LEFT JOIN vdv.rec_ort
                ON lid_verlauf.onr_typ_nr =  rec_ort.onr_typ_nr
                AND lid_verlauf.ort_nr = rec_ort.ort_nr
                
            WHERE rec_frt.frt_fid = ${tripId}
            ORDER BY time_est
        `)
            .then(sql => connection.query(sql))
            .then(results => {
                let featureList = new FeatureList();

                for (let row of results.rows) {
                    let geometry = JSON.parse(row.json_geom);
                    delete row.json_geom;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection()
            });
    }

    getStops() {
        return Promise.resolve(
            `SELECT rec_ort.onr_typ_nr,
                rec_ort.ort_nr,
                rec_ort.ort_name,
                rec_ort.ort_ref_ort_name,
                ST_AsGeoJSON(rec_ort.the_geom) as json_geom
            FROM  vdv.rec_ort`
        )
            .then(sql => {
                if (typeof this.lines !== 'undefined') {
                    // $lines was set explicitely, otherwise everthing is accepted // TODO: What does this even mean?
                    if (this.lines.count > 0) {
                        return new FeatureList();
                    } else {
                        // some lines where selected, otherwise return empty FeatureCollection
                        sql +=
                            `INNER JOIN vdv.lid_verlauf
                                ON lid_verlauf.ort_nr=rec_ort.ort_nr
                                AND lid_verlauf.onr_typ_nr=rec_ort.onr_typ_nr
                            WHERE `;

                        sql += LineUtils.whereLines('lid_verlauf.li_nr', 'lid_verlauf.str_li_var', this.lines);
                    }
                }

                return sql;
            })
            .then(sql => connection.query(sql))
            .then(result => {
                let featureList = new FeatureList();

                for (let row of result.rows) {
                    let geometry = JSON.parse(row.json_geom);
                    delete row.json_geom;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection();
            });
    }
};