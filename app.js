'use strict';

require('express-group-routes');

const express = require('express');
const connection = require("./database/connection");
const logger = require("./util/logger");

const v1Receiver = require("./endpoint/v1/receiver");

require('express-group-routes');

function logRequests(req, res, next) {
    logger.info(`${req.method} ${req.url}`);
    next();
}

const app = express();
app.use(logRequests);

connection.connect(function (error) {
    if (error) throw error;

    logger.warn("Connected to database");

    startServer();
});

function startServer() {
    app.group("/v1", (router) => {

        router.get("/receiver", function (req, res) {
            v1Receiver.receiver(req, res)
                .then(() => {
                    res.status(200).json({success: true});
                }, error => {
                    res.status(500).json({success: false, error: error});
                });
        });

    });

    app.listen(80, function () {
        logger.warn('Example app listening on port 80!')
    });
}