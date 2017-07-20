'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");
const utils = require("../../util/utils");

const LineUtils = require("../../model/line/LineUtils");
const NewPositions = require("../../model/realtime/PositionsApp");

module.exports.positions = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let positions = new NewPositions(client);

                    let lines = req.params.lines;
                    let trip = req.params.trip;
                    let vehicle = req.params.vehicle;

                    // noinspection EqualityComparisonWithCoercionJS
                    if (lines != null) {
                        positions.setLines(LineUtils.fromAppExpressQuery(lines));
                    }

                    // noinspection EqualityComparisonWithCoercionJS
                    if (vehicle != null) {
                        positions.setVehicle(vehicle);
                    }

                    // noinspection EqualityComparisonWithCoercionJS
                    if (trip != null) {
                        positions.setTrip(trip);
                    }

                    return positions.getBuses();
                })
                .then(positions => {
                    res.status(200).jsonp(positions);

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

module.exports.delays = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    return new NewPositions(client).getDelays();
                })
                .then(positions => {
                    res.status(200).jsonp(positions);
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