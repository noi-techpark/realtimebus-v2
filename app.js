'use strict';

require('express-group-routes');
require("./util/utils");

const express = require('express');
const bodyParser = require('body-parser');

const connection = require("./database/connection");
const logger = require("./util/logger");

const v1Receiver = require("./endpoint/v1/receiver");

require('express-group-routes');

function logRequests(req, res, next) {
    logger.info(`${req.method} ${req.url}`);
    next();
}

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at: Promise', promise, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

const app = express();

app.use(logRequests);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

connection.connect(function (error) {
    if (error) throw error;

    logger.warn("Connected to database");

    startServer();
});

function startServer() {
    app.group("/v1", (router) => {

        router.post("/receiver", function (req, res) {
            v1Receiver.receiver(req, res)
                .then(() => {
                    res.status(200).json({success: true});
                })
                .catch(error => {
                    logger.error(`Error: ${error}`);
                    res.status(500).json({success: false, error: error});
                })
        });

    });

    app.listen(80, function () {
        logger.warn('Example app listening on port 80!')
    });
}