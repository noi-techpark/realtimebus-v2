'use strict';

const config = require("../../config");
const utils = require("../../util/utils");
const logger = require("../../util/logger");

const RealtimeModel = require("./RealtimeModel");
const LineUtils = require("../line/LineUtils");


module.exports = class PositionsApp {

    constructor(client) {
        this.client = client;
        this.outputFormat = config.coordinate_wgs84;
    }


    setLines(lines) {
        this.lines = lines;
    }

    setVehicle(vehicle) {
        if (!utils.isNumber(vehicle)) {
            utils.throwTypeError("vehicle", "number", vehicle)
        }

        this.vehicle = vehicle;
    }

    setTrip(trip) {
        if (!utils.isNumber(trip)) {
            utils.throwTypeError("trip", "number", trip)
        }

        this.trip = trip;
    }


    getBuses() {
        return Promise.resolve()
            .then(() => {
                let lineFilter = '';
                let vehicleFilter = '';
                let tripFilter = '';

                if (!utils.isEmptyArray(this.lines)) {
                    logger.info(`Line filter is enabled: lines='${JSON.stringify(this.lines)}'`);
                    lineFilter = " AND (" + LineUtils.buildForAppSql(this.lines) + ")";
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (this.vehicle != null) {
                    logger.info(`Vehicle filter is enabled: vehicle='${this.vehicle}'`);
                    vehicleFilter = ` AND vehicle = ${this.vehicle}`;
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (this.trip != null) {
                    logger.info(`Trip filter is enabled: trip='${this.trip}'`);
                    tripFilter = ` AND rec_frt.trip = ${this.trip}`;
                }

                return `
                    SELECT DISTINCT ON (vehicle) vehicle,
                        rec_frt.trip::int,
                        rec_frt.line,
                        rec_frt.variant,
                        line_name,
                        vehicle,
                        
                        hex AS color_hex,
                        hue AS color_hue,
                        
                        ROUND(extract(epoch FROM (NOW() - gps_date))::int / 60) as updated_min_ago,
                        ROUND(extract(epoch FROM (NOW() - insert_date))::int / 60) as inserted_min_ago,
                        
                        ROUND(delay_sec / 60) AS delay_min,

                        gps_date,
                        insert_date,
                        
                        next_rec_ort.ort_nr AS bus_stop,
                        
                        (floor((extract(epoch FROM NOW()::time) - rec_frt.departure) / 60)::int % 1440) AS departure,
                        
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.the_geom, ${this.outputFormat})) AS json_geom,
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.extrapolation_geom, ${this.outputFormat})) AS json_extrapolation_geom,
                        
                        (SELECT lid_verlauf.ort_nr
                            FROM data.lid_verlauf
                            
                            WHERE lid_verlauf.line = rec_frt.line
                                AND lid_verlauf.variant = rec_frt.variant
                            
                            ORDER BY lid_verlauf.li_lfd_nr
                            LIMIT 1) AS origin,
                            
                        (SELECT lid_verlauf.ort_nr
                            FROM data.lid_verlauf
                            
                            WHERE lid_verlauf.line = rec_frt.line
                                AND lid_verlauf.variant = rec_frt.variant
                            
                            ORDER BY lid_verlauf.li_lfd_nr DESC
                            LIMIT 1) AS destination
                        
                    FROM data.vehicle_positions

                    INNER JOIN data.rec_frt
                        ON vehicle_positions.trip=rec_frt.teq

                    INNER JOIN data.rec_lid
                        ON rec_frt.line=rec_lid.line
                        AND rec_frt.variant=rec_lid.variant

                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line

                    LEFT JOIN data.lid_verlauf lid_verlauf_next
                        ON rec_frt.line=lid_verlauf_next.line
                        AND rec_frt.variant=lid_verlauf_next.variant
                        AND vehicle_positions.li_lfd_nr + 1 = lid_verlauf_next.li_lfd_nr

                    LEFT JOIN data.rec_ort next_rec_ort
                        ON lid_verlauf_next.onr_typ_nr=next_rec_ort.onr_typ_nr
                        AND lid_verlauf_next.ort_nr=next_rec_ort.ort_nr
                        
                    WHERE gps_date > NOW() - INTERVAL '${config.realtime_bus_timeout_minutes} minute'
                        -- AND str_li_var < 990
                        -- AND vehicle_positions.status='r'
                    
                    ${lineFilter}
                    ${vehicleFilter}
                    ${tripFilter}
                    
                    GROUP BY vehicle, rec_frt.trip, rec_lid.line_name, line_colors.hex, line_colors.hue,
                             vehicle_positions.gps_date, vehicle_positions.insert_date, vehicle_positions.delay_sec, 
                            next_rec_ort.ort_nr, vehicle_positions.the_geom, vehicle_positions.extrapolation_geom
                    
                    ORDER BY vehicle DESC, gps_date DESC
               `
            })
            .then(sql => this.client.query(sql))
            .then(result => {
                // console.log(result);

                let realtime = new RealtimeModel();

                for (let row of result.rows) {
                    // console.log(row);

                    let geometry;

                    // noinspection EqualityComparisonWithCoercionJS
                    geometry = JSON.parse(row.json_extrapolation_geom == null ? row.json_geom : row.json_extrapolation_geom);

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    let feature = {
                        trip: row.trip,

                        line_id: row.line,
                        line_name: row.line_name,
                        bus_stop: row.bus_stop,

                        variant: row.variant,
                        vehicle: row.vehicle,

                        delay_min: row.delay_min,
                        latitude: Math.round(geometry.coordinates[1] * 100000) / 100000,
                        longitude: Math.round(geometry.coordinates[0] * 100000) / 100000,

                        color_hex: row.color_hex,
                        color_hue: row.color_hue,

                        zone: utils.getZoneForLine(row.line),

                        updated_min_ago: row.updated_min_ago,
                        inserted_min_ago: row.inserted_min_ago,

                        origin: row.origin,
                        destination: row.destination,
                        departure: row.departure,

                        path: row.path
                    };

                    realtime.add(feature);
                }

                return realtime.getBusCollection();
            });
    }

    getDelays() {
        return Promise.resolve()
            .then(() => {
                return `
                    SELECT DISTINCT ON (vehicle) vehicle,
                        rec_frt.trip::int,
                        vehicle,
                        
                        ROUND(delay_sec / 60) AS delay_min,

                        next_rec_ort.ort_nr AS bus_stop
                        
                    FROM data.vehicle_positions

                    INNER JOIN data.rec_frt
                        ON vehicle_positions.trip=rec_frt.teq

                    LEFT JOIN data.lid_verlauf lid_verlauf_next
                        ON rec_frt.line=lid_verlauf_next.line
                        AND rec_frt.variant=lid_verlauf_next.variant
                        AND vehicle_positions.li_lfd_nr + 1 = lid_verlauf_next.li_lfd_nr

                    LEFT JOIN data.rec_ort next_rec_ort
                        ON lid_verlauf_next.onr_typ_nr=next_rec_ort.onr_typ_nr
                        AND lid_verlauf_next.ort_nr=next_rec_ort.ort_nr
                        
                    WHERE gps_date > NOW() - INTERVAL '${config.realtime_bus_timeout_minutes} minute'
                        -- AND str_li_var < 990
                        -- AND vehicle_positions.status='r'
                    
                    ORDER BY vehicle DESC, gps_date DESC
               `
            })
            .then(sql => this.client.query(sql))
            .then(result => {
                // console.log(result);

                let realtime = new RealtimeModel();

                for (let row of result.rows) {
                    // console.log(row);

                    let feature = {
                        trip: row.trip,
                        bus_stop: row.bus_stop,
                        vehicle: row.vehicle,
                        delay_min: row.delay_min,
                    };

                    realtime.add(feature);
                }

                return realtime.getBusCollection();
            });
    }
};