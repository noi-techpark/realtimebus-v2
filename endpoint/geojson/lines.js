'use strict';

const database = require("../../database/database");
const config = require("../../config");
const logger = require("../../util/logger");

const LinesFinder = require("../../model/line/LinesFinder");

module.exports = {

    fetchAllLinesAction(req, res) {
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
                        res.status(500).jsonp({success: false, error: error});

                        client.release();
                    })
            })
            .catch(error => {
                logger.error(`Error acquiring client: ${error}`);
                res.status(500).jsonp({success: false, error: error})
            })
    },

    fetchLinesAction(req, res) {
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
                        res.status(500).jsonp({success: false, error: error});

                        client.release();
                    })
            })
            .catch(error => {
                logger.error(`Error acquiring client: ${error}`);
                res.status(500).jsonp({success: false, error: error})
            })
    }
};

