'use strict';

const connection = require("../../database/connection");
const logger = require('../../util/logger');

const FeatureList = require("../../model/realtime/FeatureList");
const DataWriter = require("../../model/realtime/DataWriter");

const ActualPositionLineReference = require("../../model/realtime/writertask/ActualPositionLineReference");
const ActualPositionUpdater = require("../../model/realtime/writertask/ActualPositionUpdater");
const LineUtils = require("../../model/realtime/LineUtils");

const config = require("../../config");

const Positions = require("../../model/realtime/Positions");

module.exports = {

    positions: function (req) {
        return new Promise(function (resolve, reject) {
            // TODO: What do these do and why are they needed?

            let outputFormat = config.database_coordinate_format;
            let positions = new Positions(outputFormat);
            
            let linesStr = req.query.lines;

            if (typeof linesStr !== 'undefined' && linesStr.length > 0) {
                positions.setLines(LineUtils.getLinesFromQuery(linesStr));
            }

            resolve(positions.getAll());
        });
    }
};