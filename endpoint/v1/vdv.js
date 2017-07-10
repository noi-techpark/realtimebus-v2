'use strict';

const logger = require('../../util/logger');
const fs = require("fs");

module.exports = {

    upload: function (req, res) {
        return new Promise(function (resolve, reject) {
            fs.writeFile('vdv/latest.zip', req.body, function(err) {
                if (err) {
                    return reject(err);
                }

                logger.debug("Saved zip file containing VDV data");

                fs.writeFile('vdv/' + new Date().toISOString() + '.zip', req.body, function(err) {
                    if (err) {
                        return reject(err);
                    }

                    logger.debug("Archived zip file containing VDV data");
                    resolve()
                })
            })
        });
    }
};