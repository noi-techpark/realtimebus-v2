'use strict';

const logger = require('../../util/logger');
const config = require("../../config");
const utils = require("../../util/utils");

const LineUtils = require("../../model/line/LineUtils");
const Positions = require("../../model/realtime/Positions");

module.exports.positions = function (req, res) {
    Promise.resolve().then(() => {
        let positions = new Positions(req.query.coordinates);
        let lines = req.params.lines;

        if (!utils.isEmptyArray(lines)) {
            positions.setLines(LineUtils.fromExpressQuery(lines));
        }

        return positions.getBuses(req.query);
    }).then(positions => {
        res.status(200).jsonp(positions);
    }).catch(error => {
        logger.error(error);
        utils.respondWithError(res, error);
    })
};