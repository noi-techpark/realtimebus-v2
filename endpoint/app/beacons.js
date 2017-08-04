'use strict';

const database = require("../../database/database");
const logger = require("../../util/logger");

const utils = require("../../util/utils");

const moment = require("moment");

module.exports.insertBus = function (req, res) {
    database.connect()
        .then(client => {
            return new Promise(function (resolve, reject) {
                let body = req.body;

                if (body.length === 0) {
                    throw("No beacons uploaded");
                }

                logger.debug(`Inserting buses: ${JSON.stringify(body)}`);

                let sql = `INSERT INTO beacons.buses (battery, firmware, hardware, mac_address, major, minor, recorded, system_id)
                           VALUES `;

                for (let i = 0; i < body.length; i++) {
                    let beacon = body[i];

                    logger.debug(`Processing beacon: '${beacon}'`);

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

                sql = sql.substring(0, sql.length - 2);

                logger.debug(`Sql: '${sql}'`);

                resolve(sql)
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
        })
};