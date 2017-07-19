'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const utils = require("../../util/utils");

module.exports.insert = function (req, res) {
    database.connect()
        .then(client => {
            return database.query(`INSERT INTO beacons.buses VALUES ()`);
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);
            utils.respondWithError(res, error);
        })
};
