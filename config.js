'use strict';

let localConfig = require('./local-config')

let config = {};

config.database = localConfig.database;

config.coordinate_etrs89 = 25832;  // ETRS89, UTM zone 32N
config.coordinate_wgs84 = 4326;    // WGS84

config.realtime_next_stops_limit = 16;
config.realtime_bus_timeout_minutes = 2;

config.realtimebus_timetable_time_horizon = 43200;

config.vdv_import_running = false;

config.vdv_import_username = localConfig.vdv.username;
config.vdv_import_password = localConfig.vdv.password;

config.firebase_messaging_key_sasabz = process.env.FIREBASE_MESSAGING_KEY_SASABZ;
config.firebase_messaging_key_sasaios = process.env.FIREBASE_MESSAGING_KEY_SASAIOS;
config.firebase_messaging_key_sasabus = process.env.FIREBASE_MESSAGING_KEY_SASABUS;

config.enable_error_reporting = process.env.ERROR_REPORTING || false;

config.lang_default = "en";

config.users = {};
config.users[localConfig.vdv.username] = localConfig.vdv.password;

module.exports = config;
