'use strict';

let config = {};

config.database_coordinate_format = 25832;  // ETRS89, UTM zone 32N
config.output_coordinate_format = 4326;     // WGS84

config.realtime_next_stops_limit = 10;

module.exports = config;
