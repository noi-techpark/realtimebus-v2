'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/line/LineUtils");
const PositionsApp = require("../../model/realtime/PositionsApp");

const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const fs = require("fs");
const p = require("node-protobuf");


module.exports = {

    positions: function (req, res) {
        Promise.resolve().then(() => {
            let outputFormat = config.database_coordinate_format;
            let positions = new PositionsApp(outputFormat);

            let lines = req.query.lines;

            if (typeof lines !== 'undefined' && lines.length > 0) {
                positions.setLines(LineUtils.fromExpressQuery(lines));
            }

            return positions.getBuses();
        }).then(positions => {
            positions = JSON.parse(positions).buses;

            let message = new GtfsRealtimeBindings.FeedMessage();

            console.log(message);

            let header = new GtfsRealtimeBindings.FeedHeader();
            header.gtfs_realtime_version = "1.0";
            header.incrementality = 0;
            header.timestamp = new Date().getTime();

            let entities = [];

            for (let position of positions) {
                console.log(position);

                let entity = new GtfsRealtimeBindings.FeedEntity();
                entity.id = "410";

                entities.push(entity);

                break;
            }

            message.header = header;
            message.entity = entities;

            return message.encode().toBuffer();
        }).then(buffer => {
            console.log("Sending response");
            res.status(200).send(buffer);
        }).catch(error => {
            logger.error(error);
            res.status(500).jsonp({success: false, error: error})
        })
    }
};