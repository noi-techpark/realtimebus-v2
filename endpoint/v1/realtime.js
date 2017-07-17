'use strict';

const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/line/LineUtils");
const Positions = require("../../model/realtime/Positions");

module.exports = {

    positions: function (req, res) {
        Promise.resolve().then(() => {
            let outputFormat = config.database_coordinate_format;
            let positions = new Positions(outputFormat);

            let lines = req.params.lines;
            let vehicle = req.params.vehicle;

            if (typeof lines !== 'undefined' && lines.length > 0) {
                positions.setLines(LineUtils.getLinesFromQuery(lines));
            }

            // noinspection EqualityComparisonWithCoercionJS
            if (vehicle != null) {
                positions.setVehicle(vehicle);
            }

            return positions.getAll();
        }).then(positions => {
            res.status(200).jsonp(positions);
        }).catch(error => {
            logger.error(error);
            res.status(500).jsonp({success: false, error: error})
        })
    }
};