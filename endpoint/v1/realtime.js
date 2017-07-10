'use strict';

const connection = require("../../database/connection");
const logger = require('../../util/logger');

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");

module.exports = {

    positions: function (req, res) {
        return new Promise(function (resolve, reject) {
            // TODO: What do these do and why are they needed?
            let srid = 25832; // $this->container->getParameter('realtimebus.map.srid');

            $positions = new Positions($db = $this->get('doctrine')->getConnection(), $srid);
            
            $linesStr = $request->query->get('lines');
            if (!is_null($linesStr)) {
                $positions->setLines(LinesUtils::getLinesFromQuery($linesStr));
            }
            return ControllerUtils::jResponse($positions->positions(), $callbackFunction);

            logger.debug("receiver(): dbSrid=%d, dataSrid=%s", dbSrid, dataSrid);

            let featureList = FeatureList.createFromGeoJson(req.body);
            let positionUpdater = new ActualPositionUpdater();

            logger.debug(`Inserting ${featureList.getFeatures().length} buses`);

            let chain = Promise.resolve();

            for (let feature of featureList.getFeatures()) {
                // TODO: Check if feature contains trip id

                logger.log(`Feature: ${JSON.stringify(feature)}`);

                feature.properties.frt_fid = parseInt(feature.properties.frt_fid);
                let tripId = feature.properties.frt_fid;

                /*if (empty($feature['properties']['frt_fid'])) {
                    $this->logger->info("feature has no frt_fid");
                    continue;
                }*/

                let wktString = DataWriter.wktFromGeoArray(feature.geometry);

                feature.geometry_sql = `ST_Transform(ST_GeomFromText('${wktString}', ${dataSrid}), ${dbSrid})`;

                let lineReference = new ActualPositionLineReference();

                chain = chain
                    .then(() => {
                        return lineReference.getLineReference(feature)
                    })
                    .then((result) => {
                        feature.properties = Object.assign(feature.properties, result);

                        logger.log(`Properties: ${JSON.stringify(feature.properties)}`);

                        return result
                    })
                    .then(() => {
                        return positionUpdater.checkConditions(tripId, feature)
                    })
                    .then(() => {
                        return positionUpdater.checkIfInternal(tripId, feature)
                    })
                    .then(() => {
                        return positionUpdater.insertIntoDatabase(tripId, feature)
                    })
                    .catch(error => {
                        logger.error(`Error inserting trip ${tripId}: ${error}`);
                    });
            }

            chain.then(() => {
                resolve()
            })
                .catch(error => {
                    reject(error)
                })
        });
    }
};