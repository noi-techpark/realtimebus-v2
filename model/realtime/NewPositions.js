'use strict';

const config = require("../../config");

const RealtimeModel = require("./RealtimeModel");
const LineUtils = require("../line/LineUtils");

module.exports = class NewPositions {

    constructor(client) {
        this.client = client;
        this.outputFormat = config.coordinate_wgs84;
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
                    whereLines = " AND (" + LineUtils.whereLines('rec_frt.line', 'rec_frt.variant', this.lines) + ")";
                }

                // TODO: Check if 'updated_min_ago' and 'inserted_min_ago' are correct

                return `
                    SELECT DISTINCT (vehicle),
                        rec_frt.trip,
                        rec_frt.line,
                        rec_frt.variant,
                        line_name,
                        vehicle,
                        
                        hex AS color_hex,
                        hue AS color_hue,
                        
                        ROUND(extract(epoch FROM (NOW() - gps_date))::int / 60) as updated_min_ago,
                        ROUND(extract(epoch FROM (NOW() - insert_date))::int / 60) as inserted_min_ago,
                        
                        delay_sec,

                        gps_date,
                        insert_date,
                        next_rec_ort.ort_nr AS bus_stop,
                        
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
                    
                    ORDER BY gps_date
                    
                    ${whereLines}
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

                    let zone =  [
                        1001, 1003, 1005, 1006, 1071, 1072, 1008, 1009, 1101, 1102, 1011,
                        1012, 1014, 110, 111, 112, 116, 117, 1153, 183, 201, 202
                    ].includes(row.line) ? 'BZ' : 'ME';

                    let feature = {
                        trip: parseInt(row.trip),

                        line_id: row.line,
                        line_name: row.line_name,
                        bus_stop: row.bus_stop,

                        variant: parseInt(row.variant),
                        vehicle: parseInt(row.vehicle.split(" ")[0]),

                        delay_min: Math.round(row.delay_sec / 60),
                        latitude: Math.round(geometry.coordinates[1] * 1000000) / 1000000,
                        longitude: Math.round(geometry.coordinates[0] * 1000000) / 1000000,

                        inserted: row.insert_date,
                        updated: row.gps_date,

                        color_hex: row.color_hex,
                        color_hue: row.color_hue,

                        zone: zone,

                        updated_min_ago: row.updated_min_ago,
                        inserted_min_ago: row.inserted_min_ago
                    };

                    realtime.add(feature);
                }

                return realtime.getBusCollection();
            });
    }
};