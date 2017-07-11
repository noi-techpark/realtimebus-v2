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

function HttpError(code, message) {
    Error.captureStackTrace(this, HttpError);

    this.name = HttpError.name;
    this.code = code;
    this.message = message;
}

util.inherits(HttpError, Error);

module.exports = HttpError;

