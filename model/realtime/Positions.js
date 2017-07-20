'use strict';

const connection = require("../../database/database");
const config = require("../../config");
const utils = require("../../util/utils");
const logger = require("../../util/logger");

const FeatureList = require("../../model/realtime/FeatureList");
const LineUtils = require("../line/LineUtils");

module.exports = class Positions {

    constructor() {
        this.outputFormat = config.coordinate_etrs89;
    }

    setLines(lines) {
        this.lines = lines;
    }

    setVehicle(vehicle) {
        this.vehicle = vehicle;
    }

    getBuses() {
        return Promise.resolve()
            .then(() => {
                let lineFilter = '';
                let vehicleFilter = '';

                if (!utils.isEmpty(this.lines)) {
                    logger.info(`Line filter is enabled: lines='${JSON.stringify(this.lines)}'`);
                    lineFilter = " AND (" + LineUtils.buildForSql('rec_frt.line', 'rec_frt.variant', this.lines) + ")";
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (this.vehicle != null) {
                    logger.info(`Vehicle filter is enabled: vehicle='${this.vehicle}'`);
                    vehicleFilter = ` AND SPLIT_PART(vehicle, ' ', 1) IN (${this.vehicle})`;
                }

                return `
                    SELECT DISTINCT ON (vehicle) vehicle,
                        remark AS bemerkung,
                        delay_sec,
                        depot,
                        direction AS li_ri_nr,
                        rec_frt.trip_time_group AS fgr_nr,
                        trip_time_group_text AS fgr_text,
                        rec_frt.trip::int AS frt_fid,
                        vehicle AS fzg_nr,
                        rec_frt.service AS leistungsart_nr,
                        leistungsart_text,
                        upper(hex) AS hexcolor,
                        hue,
                        insert_date AS inserted,
                        rec_frt.line AS li_nr,
                        rec_frt.variant AS str_li_var,
                        line_name AS lidname,
                        li_kuerzel,
                        vehicle_positions.li_lfd_nr + 1 AS li_lfd_nr,
                        next_rec_ort.ort_name,
                        next_rec_ort.ort_nr,
                        next_rec_ort.ort_ref_ort,
                        next_rec_ort.ort_ref_ort_kuerzel,
                        next_rec_ort.ort_ref_ort_name,
                        -- status,
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.the_geom, ${this.outputFormat})) AS json_geom,
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.extrapolation_geom, ${this.outputFormat})) AS json_extrapolation_geom,
                        gps_date AS updated,
                        red AS li_r,
                        green AS li_g,
                        blue AS li_b,
                        (SELECT JSON_AGG(bus_stops) FROM (SELECT
                                lid_verlauf.ort_nr,
                                rec_ort.ort_name,
                                rec_ort.ort_nr,
                                rec_ort.ort_pos_breite / 10000000::DECIMAL AS ort_pos_breite,
                                rec_ort.ort_pos_laenge / 10000000::DECIMAL AS ort_pos_laenge,
                                rec_ort.ort_ref_ort,
                                rec_ort.ort_ref_ort_kuerzel,
                                rec_ort.ort_ref_ort_name,
                                CASE
                                    WHEN travel_times.travel_time IS NULL THEN (departure % 86400) * interval '1 second'
                                    ELSE ((departure + travel_times.travel_time) % 86400) * interval '1 second'
                                END AS ort_zeit,
                                CASE WHEN rec_ort.richtungswechsel = 0 THEN FALSE ELSE TRUE END AS richtungswechsel
                    
                            FROM data.rec_frt
                            
                            LEFT JOIN data.lid_verlauf
                                ON lid_verlauf.line = rec_frt.line
                                AND lid_verlauf.variant = rec_frt.variant
                            
                            LEFT JOIN data.travel_times
                                ON travel_times.trip = rec_frt.trip
                                AND travel_times.li_lfd_nr_end = lid_verlauf.li_lfd_nr
                            
                            LEFT JOIN data.rec_ort
                                ON lid_verlauf.ort_nr = rec_ort.ort_nr
                            
                            WHERE rec_frt.teq = vehicle_positions.trip ORDER BY li_lfd_nr) AS bus_stops) AS lid_verlauf
                        
                    FROM data.vehicle_positions
                    
                    INNER JOIN data.rec_frt
                        ON vehicle_positions.trip=rec_frt.teq
                        
                    INNER JOIN data.rec_lid
                        ON rec_frt.line=rec_lid.line
                        AND rec_frt.variant=rec_lid.variant
                        
                    LEFT JOIN data.lid_verlauf lid_verlauf_paths
                        ON lid_verlauf_paths.line=rec_frt.line
                        AND lid_verlauf_paths.variant=rec_frt.variant
                    
                    LEFT JOIN data.lid_verlauf lid_verlauf_next
                        ON rec_frt.line=lid_verlauf_next.line
                        AND rec_frt.variant=lid_verlauf_next.variant
                        AND vehicle_positions.li_lfd_nr + 1 = lid_verlauf_next.li_lfd_nr
                    
                    LEFT JOIN data.rec_ort next_rec_ort
                        ON lid_verlauf_next.onr_typ_nr=next_rec_ort.onr_typ_nr
                        AND lid_verlauf_next.ort_nr=next_rec_ort.ort_nr
                        
                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line
                        
                    LEFT JOIN data.menge_fgr
                        ON rec_frt.trip_time_group=menge_fgr.trip_time_group
                        
                    LEFT JOIN data.menge_leistungsart
                        ON rec_frt.service=menge_leistungsart.service
                    
                    LEFT JOIN data.rec_frt_bedienung
                        ON rec_frt.trip=rec_frt_bedienung.trip
                        
                    WHERE gps_date > NOW() - interval '10 minute'
                    -- AND vehicle_positions.status='r'
                    
                    ${lineFilter}
                    ${vehicleFilter}
                    
                    ORDER BY vehicle DESC, gps_date DESC
               `
            })
            .then(sql => connection.query(sql))
            .then(result => {
                let featureList = new FeatureList();

                for (let row of result.rows) {
                    // noinspection EqualityComparisonWithCoercionJS
                    let geometry = row.json_extrapolation_geom != null ? JSON.parse(row.json_extrapolation_geom) : JSON.parse(row.json_geom);
                    let hex = ((1 << 24) + (row.li_r << 16) + (row.li_g << 8) + row.li_b).toString(16).slice(1);

                    row.hexcolor2 = hex.toUpperCase();

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    delete row.trip;
                    delete row.line;
                    delete row.line_name;
                    delete row.li_r;
                    delete row.li_g;
                    delete row.li_b;
                    delete row.vehicle;

                    featureList.add(row, geometry);
                }

                return featureList.getFeatureCollection();
            });
    }
};