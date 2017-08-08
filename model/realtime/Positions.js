'use strict';

const connection = require("../../database/database");
const config = require("../../config");
const Utils = require("../../util/utils");
const logger = require("../../util/logger");

const FeatureList = require("../../model/realtime/FeatureList");
const HttpError = require("../../util/HttpError");
const LineUtils = require("../line/LineUtils");

const GEOMETRY = "geometry";
const PROPERTIES = "properties";
const OPERATORS = {
    'eq': '=',
    'le': '<=',
    'lt': '<',
    'ne': '<>',
    'is_not_null': 'IS NOT NULL',
    'is_null': 'IS NULL',
    'ge': '>=',
    'gt': '>'
};
const DB_PARAMS = {
    bemerkung: "remark",
    delay_min: "ROUND(delay_sec / 60::DECIMAL)::INT",
    delay_sec: "delay_sec",
    fgr_nr: "rec_frt.trip_time_group",
    fgr_text: "trip_time_group_text",
    frt_fid: "rec_frt.trip::INT",
    frt_start: "departure % 86400",
    frt_zeit: "(EXTRACT(EPOCH FROM TIMEZONE('Europe/Rome', NOW()))::INT) % 86400 - departure % 86400",
    fzg_depot: "depot",
    fzg_nr: "vehicle",
    gps_enabled_at: "insert_date",
    gps_updated_at: "gps_date",
    hexcolor: "upper(hex)",
    hexcolor2: "'hexcolor2'",
    hue: "hue",
    leistungsart_nr: "rec_frt.service",
    leistungsart_text: "leistungsart_text",
    lid_verlauf: "JSON_AGG(lid_verlauf_paths.ort_nr ORDER BY lid_verlauf_paths.li_lfd_nr)",
    lidname: "line_name",
    li_lfd_nr: "vehicle_positions.li_lfd_nr + 1",
    li_nr: "rec_frt.line",
    li_ri_nr: "direction",
    li_zone: "SPLIT_PART(li_kuerzel, ' ', 2)",
    ort_name: "next_rec_ort.ort_name",
    ort_nr: "next_rec_ort.ort_nr",
    ort_ref_ort: "next_rec_ort.ort_ref_ort",
    ort_ref_ort_kuerzel: "next_rec_ort.ort_ref_ort_kuerzel",
    ort_ref_ort_name: "next_rec_ort.ort_ref_ort_name",
    str_li_var: "rec_frt.variant"
};

let includeHexColor2 = false;

module.exports = class Positions {

    constructor(outputFormat) {
        this.outputFormat = outputFormat || config.coordinate_wgs84;
    }

    setLines(lines) {
        this.lines = lines;
    }

    getBuses(urlParams) {
        return Promise.resolve()
            .then(() => {
                let sqlFilter = '';

                Object.keys(urlParams).sort().forEach(function (jsonParam) {
                    if (DB_PARAMS[jsonParam] == null || jsonParam.slice(-3) === "_op") {
                        return;
                    }

                    let dbParam = DB_PARAMS[jsonParam];
                    let urlValue = urlParams[jsonParam];
                    let opField = urlParams[jsonParam + "_op"];
                    let op = OPERATORS[opField];

                    if (opField == null && op == null) {
                        sqlFilter += ` AND ${DB_PARAMS[jsonParam]} IN (${urlValue.split(',').map(function (value) {
                            return `'${value}'`;
                        }).join()})`;
                    } else {
                        sqlFilter += ` AND ${DB_PARAMS[jsonParam]} ${op}`;

                        if (op !== 'IS NOT NULL' && op !== 'IS NULL') {
                            sqlFilter += ` '${urlValue}'`;
                        }
                    }
                });

                logger.info("SQL filter:" + sqlFilter);

                let lineFilter = '';

                if (!Utils.isEmptyArray(this.lines)) {
                    logger.info(`Line filter: '${JSON.stringify(this.lines)}'`);
                    lineFilter = " AND (" + LineUtils.buildForSql('rec_frt.line', 'rec_frt.variant', this.lines) + ")";
                }

                let select = '';
                let groupBy = '';
                let params = urlParams[PROPERTIES] == null ? null : urlParams[PROPERTIES].split(',');

                Object.keys(DB_PARAMS).sort().forEach(function (key) {
                    if (params == null || params.indexOf(key) > -1) {
                        select += `${DB_PARAMS[key]} AS ${key}, `;

                        if (key === "li_lfd_nr") {
                            key = "vehicle_positions.li_lfd_nr"
                        }

                        if (key === "ort_nr") {
                            key = "next_rec_ort.ort_nr"
                        }

                        if (key === "lid_verlauf") {
                            return
                        }

                        groupBy += `${key}, `;
                    }
                });

                return `
                    SELECT DISTINCT ON (vehicle) vehicle, ${select}
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.the_geom, ${this.outputFormat})) AS json_geom,
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.extrapolation_geom, ${this.outputFormat})) AS json_extrapolation_geom,
                        red AS li_r,
                        green AS li_g,
                        blue AS li_b
                        
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
                        
                    WHERE gps_date > NOW() - INTERVAL '${config.realtime_bus_timeout_minutes} minute'
                    
                    ${sqlFilter}
                    ${lineFilter}
                    
                    GROUP BY ${groupBy}vehicle, json_geom, json_extrapolation_geom, li_r, li_g, li_b, gps_date
                    
                    ORDER BY vehicle DESC, gps_date DESC
               `
            })
            .then(sql => connection.query(sql))
            .then(result => {
                let featureList = new FeatureList();
                let showGeom = urlParams[GEOMETRY];

                for (let row of result.rows) {
                    // noinspection EqualityComparisonWithCoercionJS
                    let geometry = row.json_extrapolation_geom != null ? JSON.parse(row.json_extrapolation_geom) : JSON.parse(row.json_geom);
                    let hex = ((1 << 24) + (row.li_r << 16) + (row.li_g << 8) + row.li_b).toString(16).slice(1);

                    if (row.hexcolor2 == "hexcolor2") {
                        row.hexcolor2 = hex.toUpperCase();
                    }

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    delete row.vehicle;

                    delete row.li_r;
                    delete row.li_g;
                    delete row.li_b;

                    switch (showGeom) {
                        case "false":
                            featureList.add(row, null);
                            break;
                        case "true":
                        case null:
                        case undefined:
                            featureList.add(row, geometry);
                            break;
                        default:
                            throw new HttpError(`Cannot set geometry to '${showGeom}'`, 400);
                    }
                }

                return featureList.getFeatureCollection();
            });
    }
};