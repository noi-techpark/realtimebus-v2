'use strict';

const config = require("../../config");
const logger = require("../../util/logger");

const StopFinder = require("../../model/realtime/StopFinder");
const LineUtils = require("../../model/realtime/LineUtils");
const CourseFinder = require("../../model/realtime/CourseFinder");

module.exports = {

    stops: function (req, res) {
        return Promise.resolve()
            .then(() => {
                let outputFormat = config.output_coordinate_format;
                let stopFinder = new StopFinder(outputFormat);

                // noinspection EqualityComparisonWithCoercionJS

                let queryLines = req.query.lines;

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
    },

    stopsForTrip: function (req, res) {
        return Promise.resolve()
            .then(() => {
                let tripId = req.params.tripId;

                let outputFormat = config.output_coordinate_format;
                let stopFinder = new StopFinder(outputFormat);

                return stopFinder.getNextStops(tripId);
            })
            .then(stops => {
                res.status(200).json(stops);
            })
            .catch(error => {
                logger.error(error);
                res.status(500).json({success: false, error: error})
            })
    },

    nextBusesAtStop: function (req, res) {
        return Promise.resolve()
            .then(() => {
                let stop = req.params.stop;
                let stopId = {};
                let regex = /^(\d+).(\d+)$/;

                if (regex.test(stop)) {
                    let split = stop.split(".");

                    stopId.ort_nr = split[0];
                    stopId.onr_typ_nr = split[1];
                } else {
                    throw(`Stop ${stop} does not match regex '${regex}'`);
                }

                let limit = config.realtime_next_stops_limit;

                let coursesFinder = new CourseFinder();
                return coursesFinder.getCourses(stop, limit);
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