'use strict';

module.exports = class HttpError extends Error {

    constructor(message, status) {

        // Calling parent constructor of base Error class.
        super(message);

        // You can use any additional properties you want.
        // I'm going to use preferred HTTP status for this error types.
        // `500` is the default value if not specified.
        this.status = status || 500;

        delete this.stack;
    }
};