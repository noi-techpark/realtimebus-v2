'use strict';

const config = require("../../../config");

const RealtimeModel = require("./RealtimeModel");
const LineUtils = require("../LineUtils");

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

                    let feature = {
                        trip: parseInt(row.trip),
                        line_id: row.line,
                        line_name: row.line_name,
                        variant: parseInt(row.variant),
                        vehicle: parseInt(row.vehicle.split(" ")[0]),
                        delay_min: Math.round(row.delay_sec / 60),
                        latitude: Math.round(geometry.coordinates[1] * 1000000) / 1000000,
                        longitude: Math.round(geometry.coordinates[0] * 1000000) / 1000000,
                        bus_stop: row.ort_nr,
                        inserted: row.insert_date,
                        updated: row.gps_date,
                    };

                    realtime.add(feature);
                }

                return realtime.getBusCollection();
            });
    }
};