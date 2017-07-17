'use strict';

const connection = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/line/LineUtils");
const Positions = require("../../model/realtime/Positions");

let fs = require("fs");
let p = require("node-protobuf");

module.exports = {

    positions: function (req, res) {
        Promise.resolve().then(() => {
            let outputFormat = config.database_coordinate_format;
            let positions = new Positions(outputFormat);

            let lines = req.query.lines;

            if (typeof lines !== 'undefined' && lines.length > 0) {
                positions.setLines(LineUtils.getLinesFromQuery(lines));
            }

            return positions.getAll();
        }).then(positions => {
            let pb = new p(fs.readFileSync("proto/gtfs-realtime.desc"));

            let position = {
                "latitude": 46,
                "longitude": 11
            };

            let obj = {
                "position": position,
                "timestamp": new Date().getTime() / 1000
            };

            let buffer = pb.serialize(obj, "transit_realtime.VehiclePosition");             // you get Buffer here, send it via socket.write, etc.
            let newObj = pb.parse(buffer, "transit_realtime.VehiclePosition");    // you get Buffer here, send it via socket.write, etc.

            console.log(buffer);
            console.log(newObj);

            return buffer;
        }).then(buffer => {
            console.log("Sending response");
            res.status(200).send(buffer);
        }).catch(error => {
            logger.error(error);
            res.status(500).jsonp({success: false, error: error})
        })
    }
};