'use strict';

let config = {};

config.coordinate_etrs89 = 25832;  // ETRS89, UTM zone 32N
config.coordinate_wgs84 = 4326;    // WGS84

config.realtime_next_stops_limit = 10;
config.realtime_bus_timeout_minutes = 2;

config.realtimebus_timetable_time_horizon = 43200;

config.vdv_import_running = false;

config.lang_default = "en";

module.exports = config;
