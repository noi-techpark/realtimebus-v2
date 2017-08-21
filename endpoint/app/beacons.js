'use strict';

const database = require("../../database/database");
const logger = require("../../util/logger");
const utils = require("../../util/utils");

const moment = require("moment");


module.exports.insertBuses = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let body = req.body;

                    if (!utils.isArray(body)) {
                        throw("Uploaded bus beacons must be of type 'array'");
                    }

                    if (utils.isEmptyArray(body)) {
                        throw("No bus beacons uploaded");
                    }

                    return buildSql(body, "buses");
                })
                .then(sql => {
                    return client.query(sql)
                })
                .then(() => {
                    res.status(200).jsonp({success: true});
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
            utils.handleError(error)
        })
};

module.exports.insertBusStops = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let body = req.body;

                    if (!utils.isArray(body)) {
                        throw("Uploaded bus stop beacons must be of type 'array'");
                    }

                    if (utils.isEmptyArray(body)) {
                        throw("No bus stop beacons uploaded");
                    }

                    return buildSql(body, "bus_stops");
                })
                .then(sql => {
                    return client.query(sql)
                })
                .then(() => {
                    client.release();
                    res.status(200).jsonp({success: true});
                })
                .catch(error => {
                    client.release();

                    logger.error(error);
                    utils.respondWithError(res, error);
                })
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);

            utils.respondWithError(res, error);
            utils.handleError(error)
        })
};


function buildSql(body, table) {
    let sql = `INSERT INTO beacons.${table} (battery, firmware, hardware, mac_address, major, minor, recorded, system_id)
                           VALUES `;

    for (let i = 0; i < body.length; i++) {
        let beacon = body[i];

        logger.debug(`Processing beacon: '${JSON.stringify(beacon)}'`);

        utils.checkForParamThrows(beacon.battery, "battery");
        utils.checkForParamThrows(beacon.firmware, "firmware");
        utils.checkForParamThrows(beacon.hardware, "hardware");
        utils.checkForParamThrows(beacon.mac_address, "mac_address");
        utils.checkForParamThrows(beacon.major, "major");
        utils.checkForParamThrows(beacon.major, "minor");
        utils.checkForParamThrows(beacon.minor, "recorded");
        utils.checkForParamThrows(beacon.minor, "system_id");

        let time = moment(beacon.recorded).format("DD MMM YYYY hh:mm:ss a");

        sql += `(
            ${beacon.battery},
            '${beacon.firmware}',
            '${beacon.hardware}',
            '${beacon.mac_address}',
            ${beacon.major},
            ${beacon.minor},
            '${time}',
            '${beacon.system_id}'
        ), `;
    }

    return sql.substring(0, sql.length - 2);
}