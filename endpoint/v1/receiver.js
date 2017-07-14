'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");


module.exports.updatePositions = function (req, res) {
    database.connect().then(client => {
        return new Promise(function (resolve, reject) {
            let databaseFormat = config.database_coordinate_format;
            let inputFormat = config.coordinate_wgs84;

            let featureList = FeatureList.createFromGeoJson(req.body);
            let positionUpdater = new ActualPositionUpdater();
            let lineReference = new ActualPositionLineReference();

            logger.debug(`Inserting ${featureList.getFeatures().length} buses`);

            let chain = Promise.resolve();

            for (let feature of featureList.getFeatures()) {
                // TODO: Check if feature contains trip id

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

                let pointString = DataWriter.pointFromGeoArray(feature.geometry);

                feature.geometry_sql = `ST_Transform(ST_GeomFromText('${pointString}', ${inputFormat}), ${databaseFormat})`;

                chain = chain.then(() => {
                    return lineReference.getLineReference(client, feature)
                }).then((result) => {
                    feature.properties = Object.assign(feature.properties, result);

                    // logger.log(`Properties: ${JSON.stringify(feature.properties)}`);

                    return result
                }).then(() => {
                    return positionUpdater.checkIfInternal(client, tripId, feature)
                }).then(() => {
                    return positionUpdater.insertIntoDatabase(client, tripId, feature)
                }).catch(error => {
                    logger.error(`Error inserting trip ${tripId}: ${error}`);
                });
            }

            chain = chain.then(() => {
                return resolve()
            }).catch(error => {
                return reject(error)
            })
        }).then(() => {
            client.release();
            res.status(200).jsonp({success: true});
        }).catch(error => {
            client.release();

            logger.error(error);
            res.status(500).jsonp({success: false, error: error})
        })
    }).catch(error => {
        logger.error(`Error acquiring client: ${error}`);
        res.status(500).jsonp({success: false, error: error})
    })
};
