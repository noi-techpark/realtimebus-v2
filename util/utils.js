'use strict';

const util = require('util');

if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            let alt = {};

            Object.getOwnPropertyNames(this).forEach(function (key) {
                alt[key] = this[key];
            }, this);

            return alt;
        },
        configurable: true,
        writable: true
    });
}


module.exports.pointFromGeoArray = function (jsonArray) {
    if (jsonArray.type === 'Point') {
        return `POINT(${jsonArray.coordinates[0]} ${jsonArray.coordinates[1]})`;
    } else {
        throw new Error(`Geometry type '${jsonArray.type}' is not supported.`);
    }
};

