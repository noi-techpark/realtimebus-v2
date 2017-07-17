'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/line/LineUtils");
const NewPositions = require("../../model/realtime/PositionsApp");

module.exports = {

    positions: function (req, res) {
        database.connect()
            .then(client => {
                return Promise.resolve()
                    .then(() => {
                        let positions = new NewPositions(client);

                        let lines = req.params.lines;
                        let vehicle = req.params.vehicle;

                        if (typeof lines !== 'undefined' && lines.length > 0) {
                            positions.setLines(LineUtils.fromExpressQuery(lines));
                        }

                        // noinspection EqualityComparisonWithCoercionJS
                        if (vehicle != null) {
                            positions.setVehicle(vehicle);
                        }

                        return positions.getBuses();
                    })
                    .then(positions => {
                        res.status(200).jsonp(positions);

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