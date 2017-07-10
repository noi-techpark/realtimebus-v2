'use strict';

const connection = require("../../database/connection");
const logger = require("../../util/logger");

const ActualPositionLineReference = require("./writertask/ActualPositionLineReference");

module.exports = class DataWriter {

    static pointFromGeoArray(jsonArray) {
        if (jsonArray.type === 'Point') {
            return `POINT(${jsonArray.coordinates[0]} ${jsonArray.coordinates[1]})`;
        } else {
            throw new Error(`Geometry type '${jsonArray.type}' is not supported.`);
        }
    }
};