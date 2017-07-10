'use strict';

require('express-group-routes');
require("./util/utils");

const bodyParser = require('body-parser');
const connection = require("./database/connection");
const express = require('express');
const fs = require('fs');
const logger = require("./util/logger");

const v1Realtime = require("./endpoint/v1/realtime");
const v1Receiver = require("./endpoint/v1/receiver");
const v1Vdv = require("./endpoint/v1/vdv");

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
app.use(bodyParser.raw({
    limit: '10mb'
}));

connection.connect(function (error) {
    if (error) throw error;

    logger.warn("Connected to database");

    startServer()
});

function startServer() {
    app.group("/v1", (router) => {
        router.get("/positions", function (req, res) {
            v1Realtime.positions(req)
                .then(positions => {
                    res.status(200).json(positions);
                })
                .catch(error => {
                    logger.error(error);
                    res.status(500).json({success: false, error: error})
                })
        });

        router.post("/receiver", function (req, res) {
            v1Receiver.receiver(req)
                .then(() => {
                    res.status(200).json({success: true});
                })
                .catch(error => {
                    logger.error(error);
                    res.status(500).json({success: false, error: error})
                })
        });

        router.post("/vdv", function (req, res) {
            v1Vdv.upload(req)
                .then(success => {
                    res.status(200).json(success);
                })
                .catch(error => {
                    logger.error(error);
                    res.status(500).json({success: false, error: error})
                })
        });
    });

    app.listen(80, function () {
        logger.warn('Server started on port 80')
    })
}