'use strict';

const database = require("../../database/database");
const config = require("../../config");
const logger = require("../../util/logger");
const utils = require("../../util/utils");

const LinesFinder = require("../../model/line/LinesFinder");

module.exports.fetchAllLinesAction = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let city = req.query.city || '';

                    let linesFinder = new LinesFinder(client);

                    return linesFinder.getAllLines(city)
                })
                .then(lines => {
                    res.status(200).jsonp(lines);

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);

                    client.release();
                })
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);
            utils.respondWithError(res, error);
        })
};

module.exports.fetchLinesAction = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let city = req.query.city || '';
                    let timeHorizon = config.realtimebus_timetable_time_horizon;

                    let linesFinder = new LinesFinder(client);
                    return linesFinder.getActiveLines(timeHorizon, city)
                })
                .then(lines => {
                    res.status(200).jsonp(lines);

                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);

                    client.release();
                })
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);
            utils.respondWithError(res, error);
        })
};
