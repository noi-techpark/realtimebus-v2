'use strict';

const config = require("../../config");
const logger = require("../../util/logger");

const StopFinder = require("../../model/realtime/StopFinder");
const LineUtils = require("../../model/realtime/LineUtils");

module.exports = {

    stops: function (req, res) {
        return Promise.resolve(function () {
            return req.query.lines;
        })
            .then(queryLines => {
                let outputFormat = config.output_coordinate_format;
                let stopFinder = new StopFinder(outputFormat);

                // noinspection EqualityComparisonWithCoercionJS
                if (typeof queryLines !== 'undefined' && queryLines.length > 0) {
                    stopFinder.setLines(LineUtils.getLinesFromQuery(queryLines));
                }

                return stopFinder.getStops()
            })
            .then(stops => {
                res.status(200).json(stops);
            })
            .catch(error => {
                logger.error(error);
                res.status(500).json({success: false, error: error})
            })
    }
};