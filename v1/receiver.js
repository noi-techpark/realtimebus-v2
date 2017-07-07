'use strict';

const connection = require("../database/connection");
const logger = require('../util/logger');

module.exports = {

    receiver: function (req, res) {
        updatePosition();

        let maxSpeed = 40;   // $this->container->getParameter('vdv.import.max_speed');
        let dbSrid = 25832;     // $this->container->getParameter('vdv.srid');
        let dataSrid = 4326;   // $this->container->getParameter('vdv.import.srid');

        logger.debug("receiver(): dbSrid=%d, dataSrid=%s", dbSrid, dataSrid);

        // check
        /* try {
            if (true) {
                $cacheDir = $this->container->getParameter("kernel.cache_dir");
                $debugOutDir = $cacheDir . '/' . date('Y-m-d');
                if (!file_exists($debugOutDir)) {
                    if (false === mkdir($debugOutDir)) {
                        throw new Exception("Could not create $debugOutDir");
                    }
                } else if (is_dir($debugOutDir)) {
                    $debugFile = $debugOutDir . '/' . date('His') . '.geojson';
                } else {
                    throw new Exception("$debugOutDir is not a directory");
                }
            }
            $featureList = FeatureList::createFromGeoJSON($request->getContent());
            $dataWriter = new DataWriter($db, $this->get('logger'));
            // $dataWriter->addFilter(new DataFilterSpikes($db, $maxSpeed));
            $dataWriter->addFilter(new DataFilterFrtExists($db, $this->get('logger')));
            $dataWriter->addTask(new ActualPositionUpdater($db));
            $dataWriter->addTask(new ActualPositionLineReference($db));
            $dataWriter->write($featureList->getFeatures(), $dataSrid, $dbSrid);
            return new Response("Data written");
        } catch (Exception $e) {
            $this->get('logger')->warning(__METHOD__ . ", " . $e->getMessage() . PHP_EOL . $e->getTraceAsString());
            $response = new Response();
            $response->setStatus(450, "Upload problems: " . $e->getMessage());
            return $response;
        }*/

        res.json({"success": true});
    }
};

function updatePosition() {

}