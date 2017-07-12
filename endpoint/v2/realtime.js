'use strict';

const connection = require("../../database/connection");
const logger = require('../../util/logger');

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");
const LineUtils = require("../../model/realtime/LineUtils");

const config = require("../../config");

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

            return pb.serialize(obj, "VehiclePosition"); // you get Buffer here, send it via socket.write, etc.
        }).then(buffer => {
            res.status(200).write(buffer, "application/octet-stream");
        }).catch(error => {
            logger.error(error);
            res.status(500).jsonp({success: false, error: error})
        })
    }
};