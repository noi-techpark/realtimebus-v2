'use strict';

const connection = require("../../database/database");
const config = require("../../config");

const FeatureList = require("../../model/realtime/FeatureList");
const LineUtils = require("../line/LineUtils");

module.exports = class Positions {

    constructor(outputFormat) {
        this.outputFormat = outputFormat;
    }

    setLines(lines) {
        this.lines = lines;
    }

    setVehicle(vehicle) {
        this.vehicle = vehicle;
    }

    getAll() {
        return Promise.resolve()
            .then(() => {
                let lineFilter = '';
                let vehicleFilter = '';

                if (typeof this.lines !== 'undefined' && this.lines.length > 0) {
                    console.info(`Line filter is enabled: lines='${JSON.stringify(this.lines)}'`);
                    lineFilter = " AND (" + LineUtils.whereLines('rec_frt.line', 'rec_frt.variant', this.lines) + ")";
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (this.vehicle != null) {
                    console.info(`Vehicle filter is enabled: vehicle='${this.vehicle}'`);

                    // TODO: Find a better way to perform this filter.
                    vehicleFilter = ` AND (vehicle = '${this.vehicle}' OR vehicle = '${this.vehicle} BZ' OR vehicle = '${this.vehicle} ME')`;
                }

                return `
                    SELECT DISTINCT (vehicle),
                        rec_frt.trip,
                        gps_date,
                        delay_sec,
                        vehicle,
                        rec_frt.line,
                        rec_frt.variant,
                        line_name,
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
                        
                    FROM data.vehicle_position_act
                    
                    INNER JOIN data.rec_frt
                        ON vehicle_position_act.trip=rec_frt.teq_nummer
                        
                    INNER JOIN data.rec_lid
                        ON rec_frt.line=rec_lid.line
                        AND rec_frt.variant=rec_lid.variant
                        
                    LEFT JOIN data.lid_verlauf lid_verlauf_next
                        ON rec_frt.line=lid_verlauf_next.line
                        AND rec_frt.variant=lid_verlauf_next.variant
                        AND vehicle_position_act.li_lfd_nr + 1 = lid_verlauf_next.li_lfd_nr
                    
                    LEFT JOIN data.rec_ort next_rec_ort
                        ON lid_verlauf_next.onr_typ_nr=next_rec_ort.onr_typ_nr
                        AND lid_verlauf_next.ort_nr=next_rec_ort.ort_nr
                        
                    LEFT JOIN data.line_attributes
                        ON rec_frt.line=line_attributes.line
                        
                    WHERE gps_date > NOW() - interval '${config.realtime_bus_timeout_minutes} minute'
                    -- AND vehicle_position_act.status='r'
                    
                    ${lineFilter}
                    ${vehicleFilter}
                    
                    ORDER BY gps_date
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

                    let hex = ((1 << 24) + (row.li_r << 16) + (row.li_g << 8) + row.li_b).toString(16).slice(1);

                    row.hexcolor = '#' + hex;
                    row.hexcolor2 = hex.toUpperCase();

                    row.frt_fid = parseInt(row.trip);
                    row.li_nr = parseInt(row.line);
                    row.lidname = parseInt(row.line_name);
                    row.str_li_var = parseInt(row.variant);
                    row.vehicleCode = row.vehicle;

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    delete row.trip;
                    delete row.line;
                    delete row.line_name;
                    delete row.variant;
                    delete row.vehicle;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection();
            });
    }
};