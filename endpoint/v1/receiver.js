'use strict';

const connection = require("../../database/connection");
const logger = require('../../util/logger');

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");

module.exports = {

    receiver: function (req, res) {
        return new Promise(function (resolve, reject) {
            // TODO: What do these do and why are they needed?

            let maxSpeed = 40;      // $this->container->getParameter('vdv.import.max_speed');
            let dbSrid = 25832;     // $this->container->getParameter('vdv.srid');
            let dataSrid = 4326;    // $this->container->getParameter('vdv.import.srid');

            logger.debug("receiver(): dbSrid=%d, dataSrid=%s", dbSrid, dataSrid);

            let featureList = FeatureList.createFromGeoJson(req.body);
            let positionUpdater = new ActualPositionUpdater();

            let promiseChain = [];

            for (let feature in featureList.getFeatures()) {
                // TODO: Check if feature contains trip id

                /*if (empty($feature['properties']['frt_fid'])) {
                    $this->logger->info("feature has no frt_fid");
                    continue;
                }*/

                // $this->db->beginTransaction();

                let wktString = DataWriter.wktFromGeoArray(feature.geometry);

                feature.geometry_sql = `ST_Transform(ST_GeomFromText('${wktString}', ${dataSrid}), ${dbSrid})`;

                let lineReference = new ActualPositionLineReference();
                let lineReferenceData = lineReference.getLineReference(feature);

                logger.debug(`lineReferenceData='${$lineReferenceData}'`);

                // $feature['properties'] = array_merge($feature['properties'], $lineReferenceData);

                feature.properties = Object.assign(feature.properties, lineReferenceData);

                promiseChain.push(positionUpdater.insert(feature.properties.frt_fid, feature));
            }

            Promise.all(promiseChain)
                .then(() => {
                    resolve()
                }, error => {
                    reject(error)
                });
        });
    }
};