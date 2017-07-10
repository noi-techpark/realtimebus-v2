'use strict';

const connection = require("../../database/connection");
const logger = require('../../util/logger');

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");

const Positions = require("../../model/realtime/Positions");

module.exports = {

    positions: function (req) {
        return new Promise(function (resolve, reject) {
            // TODO: What do these do and why are they needed?
            let srid = 25832; // $this->container->getParameter('realtimebus.map.srid');

            let positions = new Positions(srid);
            
            let linesStr = req.query.lines;

            if (typeof linesStr !== 'undefined' && linesStr.length > 0) {
                // TODO: Filter lines
                // positions.setLines(LinesUtils::getLinesFromQuery($linesStr));
            }

            resolve(positions.positions());
        });
    }
};