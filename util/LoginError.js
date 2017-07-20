'use strict';

module.exports = class LoginError extends Error {

    constructor(error, error_message, param) {

        // Calling parent constructor of base Error class.
        super(message);

        // You can use any additional properties you want.
        // I'm going to use preferred HTTP status for this error types.
        // `500` is the default value if not specified.
        this.status = status || 200;

        this.error = error || "no_error_available";
        this.error_message = error_message;

        this.param = param;
    }
};