'use strict';

require('express-group-routes');
require("./util/utils");

const bodyParser = require('body-parser');
const connection = require("./database/connection");
const express = require('express');
const fs = require('fs');
const logger = require("./util/logger");

const v1Receiver = require("./endpoint/v1/receiver");

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

        router.post("/receiver", function (req, res) {
            v1Receiver.receiver(req, res)
                .then(() => {
                    res.status(200).json({success: true});
                })
                .catch(error => {
                    logger.error(`Error: ${error}`);
                    res.status(500).json({success: false, error: error})
                })
        });

        router.post("/vdv", function (req, res) {
            fs.writeFile('vdv/vdv.zip', req.body, function(err) {
                if (err) {
                    res.status(500).json({success: false});
                    return
                }

                logger.debug("Saved zip file containing VDV data");
                res.status(200).json({success: true})
            });
        });
    });

    app.listen(8080, function () {
        logger.debug('Server started on port 80')
    })
}