'use strict';

const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/realtime/LineUtils");
const NewPositions = require("../../model/realtime/new/NewPositions");

module.exports = {

    positions: function (req, res) {
        Promise.resolve().then(() => {
            let positions = new NewPositions();

            let lines = req.query.lines;

            if (typeof lines !== 'undefined' && lines.length > 0) {
                positions.setLines(LineUtils.getLinesFromQuery(lines));
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