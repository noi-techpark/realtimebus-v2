'use strict';

const fs = require("fs");
const logger = require("../../util/logger");
const AdmZip = require("adm-zip");

const latestVdvZip = 'vdv/latest.zip';
const latestExtractedVdvData = 'vdv/latest';

module.exports = {

    upload: function (req) {
        return new Promise(function (resolve, reject) {
            fs.writeFile(latestVdvZip, req.body, function (err) {
                if (err) {
                    return reject(err);
                }

                logger.debug("Saved zip file containing VDV data");

                new AdmZip(latestVdvZip).extractAllTo(latestExtractedVdvData, true);
                logger.debug("Extracted latest VDV data");

                fs.writeFile('vdv/' + new Date().toISOString() + '.zip', req.body, function (err) {
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