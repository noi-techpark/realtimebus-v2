'use strict';

const logger = require('../../util/logger');
const config = require("../../config");
const utils = require("../../util/utils");

const LineUtils = require("../../model/line/LineUtils");
const Positions = require("../../model/realtime/Positions");

module.exports.positions = function (req, res) {
    Promise.resolve().then(() => {
        let positions = new Positions(req.query.coords || config.coordinate_wgs84);

        let lines = req.params.lines;
        let vehicle = req.params.vehicle;

        if (!utils.isEmptyArray(lines)) {
            positions.setLines(LineUtils.fromExpressQuery(lines));
        }

        // noinspection EqualityComparisonWithCoercionJS
        if (vehicle != null) {
            positions.setVehicle(vehicle);
        }

        return positions.getBuses();
    }).then(positions => {
        res.status(200).jsonp(positions);
    }).catch(error => {
        logger.error(error);
        utils.respondWithError(res, error);
    })
};