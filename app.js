'use strict';

require('express-group-routes');
require("./util/utils");

const bodyParser = require('body-parser');
const database = require("./database/database");
const express = require('express');
const fs = require('fs');
const logger = require("./util/logger");
const config = require("./config");

const v1Realtime = require("./endpoint/v1/realtime");
const v1Receiver = require("./endpoint/v1/receiver");
const v1Stops = require("./endpoint/v1/stops");
const v1Vdv = require("./endpoint/root/vdv");

const v2Realtime = require("./endpoint/v2/realtime");

const appRealtime = require("./endpoint/app/realtime");

const ExtrapolatePositions = require("./operations/ExtrapolatePositions");
const DropOldPositions = require("./operations/DropOldPositions");

function logRequests(req, res, next) {
    logger.warn(`${req.method} ${req.url}`);
    next();
}

function checkForRunningImport(req, res, next) {
    if (config.vdv_import_running) {
        logger.info(`Import is running, skipping request '${req.url}'`);
        res.status(503).json({success: false, error: "VDV import is running. Please wait for it to complete."});

        return;
    }

    next();
}

process.on('uncaughtException', function (err) {
    logger.error('Caught exception: ');
    console.log(err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at: Promise', promise, 'reason:', reason);
});

const app = express();

app.use(logRequests);
app.use(checkForRunningImport);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(bodyParser.raw({
    limit: '10mb'
}));

app.set('jsonp callback name', 'jsonp');

database.connect()
    .then(client => {
        logger.warn("Connected to database");

        new ExtrapolatePositions().run();

        startServer()
    });

function startServer() {
    app.post("/vdv", v1Vdv.upload);

    app.group("/v1", (router) => {

        router.get("/positions", v1Realtime.positions);
        router.get("/positions/lines/:lines", v1Realtime.positions);
        router.get("/positions/vehicle/:vehicle", v1Realtime.positions);

        router.post("/receiver", v1Receiver.updatePositions);

        router.get("/stops", v1Stops.stops);
        router.get("/:stop/buses", v1Stops.nextBusesAtStop);
        router.get("/:tripId/stops", v1Stops.stopsForTrip);
    });

    app.group("/app", (router) => {

        router.get("/realtime", appRealtime.positions);
        router.get("/realtime/lines/:lines", appRealtime.positions);
        router.get("/realtime/vehicle/:vehicle", appRealtime.positions);
    });

    app.group("/gtfs", (router) => {
        router.get("/realtime", v2Realtime.positions);
    });

    // TODO: Add better method to server GTFS (and upload)
    app.use('/gtfs', express.static('static/gtfs'));


    app.use(function (req, res, next) {
        res.status(404).json({
            error: {
                code: 404,
                message: "The requested URL was not found on this server."
            }
        });
    });


    let listener = app.listen(80, function () {
        logger.warn(`Server started on port ${listener.address().port}`)
    })
}