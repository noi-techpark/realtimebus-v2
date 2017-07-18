'use strict';

const config = require("../../config");
const utils = require("../../util/utils");

const RealtimeModel = require("./RealtimeModel");
const LineUtils = require("../line/LineUtils");

// TODO: Add missing properties:

/*
{
    "departure": -412,
    "destination": 5115,
    "origin": 5120,
    "path": [
        5120,
        5106,
        5029,
        5027,
        5025,
        5032,
        5108,
        5110,
        5112,
        5114,
        5115
    ]
}
*/

module.exports = class PositionsApp {

    constructor(client) {
        this.client = client;
        this.outputFormat = config.coordinate_wgs84;
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
                    console.info(`Line filter is enabled: lines='${JSON.stringify(this.lines)}'`);
                    lineFilter = " AND (" + LineUtils.buildForAppSql(this.lines) + ")";
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (this.vehicle != null) {
                    console.info(`Vehicle filter is enabled: vehicle='${this.vehicle}'`);
                    vehicleFilter = ` AND vehicle = ${this.vehicle}`;
                }

                // TODO: Check if 'updated_min_ago' and 'inserted_min_ago' are correct

                return `
                    SELECT DISTINCT ON (vehicle) vehicle,
                        rec_frt.trip,
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
                        
                        ARRAY_AGG(lid_verlauf_paths.ort_nr ORDER BY lid_verlauf_paths.li_lfd_nr) AS path,
                        (ARRAY_AGG(lid_verlauf_paths.ort_nr ORDER BY lid_verlauf_paths.li_lfd_nr))[1] AS origin,
                        (ARRAY_AGG(lid_verlauf_paths.ort_nr ORDER BY lid_verlauf_paths.li_lfd_nr DESC))[1] AS destination,
                        
                        (floor((extract(epoch FROM NOW()::time) - rec_frt.departure) / 60)::int % 1440) AS departure,
                        
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.the_geom, ${this.outputFormat})) AS json_geom,
                        ST_AsGeoJSON(ST_Transform(vehicle_positions.extrapolation_geom, ${this.outputFormat})) AS json_extrapolation_geom
                        
                    FROM data.vehicle_positions

                    INNER JOIN data.rec_frt
                        ON vehicle_positions.trip=rec_frt.teq

                    INNER JOIN data.rec_lid
                        ON rec_frt.line=rec_lid.line
                        AND rec_frt.variant=rec_lid.variant

                    LEFT JOIN data.line_colors
                        ON rec_frt.line=line_colors.line

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
                        
                    WHERE gps_date > NOW() - interval '${config.realtime_bus_timeout_minutes} minute'
                        -- AND str_li_var < 990
                        -- AND vehicle_positions.status='r'
                    
                    ${lineFilter}
                    ${vehicleFilter}
                    
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
                    if (row.json_extrapolation_geom != null) {
                        geometry = JSON.parse(row.json_extrapolation_geom);
                    } else {
                        geometry = JSON.parse(row.json_geom);
                    }

                    delete row.json_geom;
                    delete row.json_extrapolation_geom;

                    let feature = {
                        trip: parseInt(row.trip),

                        line_id: row.line,
                        line_name: row.line_name,
                        bus_stop: row.bus_stop,

                        variant: row.variant,
                        vehicle: row.vehicle,

                        delay_min: row.delay_min,
                        latitude: Math.round(geometry.coordinates[1] * 1000000) / 1000000,
                        longitude: Math.round(geometry.coordinates[0] * 1000000) / 1000000,

                        color_hex: row.color_hex,
                        color_hue: row.color_hue,

                        zone: utils.getZoneForLine(row.line),

                        updated_min_ago: row.updated_min_ago,
                        inserted_min_ago: row.inserted_min_ago,

                        path: row.path,
                        origin: row.origin,
                        destination: row.destination,

                        departure: row.departure
                    };

                    realtime.add(feature);
                }

                return realtime.getBusCollection();
            });
    }
};