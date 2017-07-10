'use strict';

require('express-group-routes');
require("./util/utils");

const express = require('express');
const connection = require("./database/connection");
const logger = require("./util/logger");
const bodyParser = require('body-parser');

const v1Receiver = require("./endpoint/v1/receiver");

require('express-group-routes');

function logRequests(req, res, next) {
    logger.info(`${req.method} ${req.url}`);
    next();
}

const app = express();

app.use(logRequests);
app.use(bodyParser.raw({
    limit: '10mb'
}));

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

        router.post("/vdv", function (req, res) {
            res.status(200).send(req.body);
        });
    });

    app.listen(80, function () {
        logger.warn('Example app listening on port 80!')
    });
}