'use strict';

const connection = require("../../database/database");
const config = require("../../config");

const FeatureList = require("../../model/realtime/FeatureList");
const LineUtils = require("../../model/realtime/LineUtils");

module.exports = class Positions {

    constructor(outputFormat) {
        this.outputFormat = outputFormat;
    }

    setLines(lines) {
        this.lines = lines;
    }

    getAll() {
        return Promise.resolve()
            .then(() => {
                let whereLines = '';

                if (typeof this.lines !== 'undefined' && this.lines.length > 0) {
                    console.info(`Filter is enabled: lines='${this.lines}'`);
                    whereLines = " AND (" + LineUtils.whereLines('rec_frt.li_nr', 'rec_frt.str_li_var', this.lines) + ")";
                }

                return `
                    SELECT
                    rec_frt.frt_fid,
                        gps_date,
                        delay_sec,
                        vehicleCode,
                        rec_frt.li_nr,
                        rec_frt.str_li_var,
                        lidname,
                        insert_date,
                        li_r,
                        li_g,
                        li_b,
                        next_rec_ort.ort_nr AS ort_nr,
                        next_rec_ort.onr_typ_nr AS onr_typ_nr,
                        next_rec_ort.ort_name AS ort_name,
                        next_rec_ort.ort_ref_ort_name AS ort_ref_ort_name,
                        ST_AsGeoJSON(ST_Transform(vehicle_position_act.the_geom, ${this.outputFormat})) AS json_geom,
                        ST_AsGeoJSON(ST_Transform(vehicle_position_act.extrapolation_geom, ${this.outputFormat})) AS json_extrapolation_geom
                        
                    FROM vdv.vehicle_position_act
                    
                    INNER JOIN vdv.rec_frt
                        ON vehicle_position_act.frt_fid=rec_frt.teq_nummer
                        
                    INNER JOIN vdv.rec_lid
                        ON rec_frt.li_nr=rec_lid.li_nr
                        AND rec_frt.str_li_var=rec_lid.str_li_var
                        
                    LEFT JOIN vdv.lid_verlauf lid_verlauf_next
                        ON rec_frt.li_nr=lid_verlauf_next.li_nr
                        AND rec_frt.str_li_var=lid_verlauf_next.str_li_var
                        AND vehicle_position_act.li_lfd_nr + 1 = lid_verlauf_next.li_lfd_nr
                    
                    LEFT JOIN vdv.rec_ort next_rec_ort
                        ON lid_verlauf_next.onr_typ_nr=next_rec_ort.onr_typ_nr
                        AND lid_verlauf_next.ort_nr=next_rec_ort.ort_nr
                        
                    LEFT JOIN vdv.line_attributes
                        ON rec_frt.li_nr=line_attributes.li_nr
                        
                    WHERE gps_date > NOW() - interval '${config.realtime_bus_timeout_minutes} minute'
                    -- AND vehicle_position_act.status='r'
                    ${whereLines}
               `
            })
            .then(sql => connection.query(sql))
            .then(result => {
                // console.log(result);

                let featureList = new FeatureList();

                for (let row of result.rows) {
                    let geometry;

                    // noinspection EqualityComparisonWithCoercionJS
                    if (row.json_extrapolation_geom != null) {
                        geometry = JSON.parse(row.json_extrapolation_geom);
                    } else {
                        geometry = JSON.parse(row.json_geom);
                    }

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    let hex = ((1 << 24) + (row.li_r << 16) + (row.li_g << 8) + row.li_b).toString(16).slice(1);

                    row.hexcolor = '#' + hex;
                    row.hexcolor2 = hex.toUpperCase();

                    row.frt_fid = parseInt(row.frt_fid);
                    row.str_li_var = parseInt(row.str_li_var);

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection();
            });
    }
};