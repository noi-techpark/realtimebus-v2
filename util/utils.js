'use strict';

const raven = require('raven');

const logger = require('./logger');
const config = require('../config');

const enableErrorReporting = false;

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

module.exports.sortObject = function (o) {
    let sorted = {}, key, a = [];

    for (key in o) {
        if (o.hasOwnProperty(key)) {
            a.push(key);
        }
    }

    a.sort();

    for (key = 0; key < a.length; key++) {
        sorted[a[key]] = o[a[key]];
    }

    return sorted;
};

module.exports.getZoneForLine = function (line) {
    return [
        1001, 1003, 1005, 1006, 1071, 1072, 1008, 1009, 1101, 1102, 1011,
        1012, 1014, 110, 111, 112, 116, 117, 1153, 183, 201, 202
    ].includes(line) ? 'BZ' : 'ME'
};


// =================================================== REQUESTS ========================================================

module.exports.getLanguage = function (req) {
    let lang = req.get("X-Language").substring(0, 2);

    if (lang !== 'it' && lang !== 'de' && lang !== 'en') {
        return config.lang_default;
    }

    return lang;
};

// ==================================================== ERRORS =========================================================

module.exports.startErrorReporting = function () {
    if (!enableErrorReporting) {
        logger.warn("Raven error reporting is disabled");
        return
    }

    try {
        raven.config('https://405c5b47fe2c4573949031e156954ed3:d701aea274ea4f8599cfa60b29b76185@sentry.io/192719').install();
    } catch (error) {
        logger.error("Failed to set up raven")
    }
};

module.exports.handleError = function (error) {
    if (!enableErrorReporting) {
        return;
    }

    raven.captureException(error);
};

module.exports.respondWithError = function (res, error) {
    res.status(500).jsonp({success: false, error: error})
};


// ================================================ TYPE VALIDATION ====================================================

module.exports.isNumber = function (toTest) {
    return !isNaN(parseFloat(toTest)) && isFinite(toTest);
};

module.exports.isEmptyArray = function (array) {
    // noinspection EqualityComparisonWithCoercionJS
    return array == null || array.length === 0
};

module.exports.isEmpty = function (field) {
    // noinspection EqualityComparisonWithCoercionJS
    return typeof field == null
};

module.exports.throwTypeError = function (name, type, value) {
    throw(`Parameter '${name}' must be of type '${type}', was '${value}'`)
};
