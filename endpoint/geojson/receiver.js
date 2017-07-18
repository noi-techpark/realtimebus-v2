'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");
const utils = require("../../util/utils");

const FeatureList = require("../../model/realtime/FeatureList");

const PositionLineReference = require("../../model/receiver/PositionLineReference");
const PositionUpdater = require("../../model/receiver/PositionUpdater");


module.exports.updatePositions = function (req, res) {
    database.connect()
        .then(client => {
            return new Promise(function (resolve, reject) {
                let databaseFormat = config.coordinate_etrs89;
                let inputFormat = config.coordinate_wgs84;

                let featureList = FeatureList.createFromArray(req.body);

                logger.debug(`Inserting ${featureList.getFeatures().length} buses`);

                let chain = Promise.resolve();

                for (let feature of featureList.getFeatures()) {
                    // logger.log(`Feature: ${JSON.stringify(feature)}`);

                    if (!feature.hasOwnProperty("properties")) {
                        logger.error("Required property 'properties' is missing");
                        continue;
                    }

                    if (!feature.properties.hasOwnProperty("frt_fid")) {
                        logger.error("Required property 'frt_fid' is missing");
                        continue;
                    }

                    if (feature.properties.frt_fid === 0) {
                        logger.error("Required property 'frt_fid' is 0");
                        continue;
                    }

                    feature.properties.frt_fid = parseInt(feature.properties.frt_fid);
                    let tripId = feature.properties.frt_fid;

                    let pointString = utils.pointFromGeoArray(feature.geometry);

                    feature.geometry_sql = `ST_Transform(ST_GeomFromText('${pointString}', ${inputFormat}), ${databaseFormat})`;

                    chain = chain.then(() => {
                        return PositionLineReference.getLineInfo(client, feature)
                    }).then((result) => {
                        feature.properties = Object.assign(feature.properties, result);

                        // logger.log(`Properties: ${JSON.stringify(feature.properties)}`);

                        return result
                    }).then(() => {
                        return PositionUpdater.insertIntoDatabase(client, tripId, feature)
                    }).catch(error => {
                        console.log(error);
                        logger.error(`Error inserting trip ${tripId}: ${error}`);
                    });
                }

                chain = chain.then(() => {
                    return resolve()
                }).catch(error => {
                    return reject(error)
                })
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
