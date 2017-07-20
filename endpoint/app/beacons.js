'use strict';

const database = require("../../database/database");
const logger = require("../../util/logger");

module.exports.insertBus = function (req, res) {
    database.connect()
        .then(client => {
            return new Promise(function (resolve, reject) {
                let body = req.body;

                logger.debug(`Inserting bus: ${JSON.stringify(body)}`);

                let sql = `INSERT INTO beacons.buses (battery, firmware, hardware, mac_address, major, minor, recorded, system_id)
                           VALUES (
                                ${body.battery}, 
                                '${body.firmware}', 
                                '${body.hardware}', 
                                '${body.mac}', 
                                ${body.major}, 
                                ${body.minor}, 
                                '${body.recorded}', 
                                '${body.sysId}'
                            )`;

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