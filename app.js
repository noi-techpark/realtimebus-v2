'use strict';

require('express-group-routes');

const yargs = require('yargs');

const database = require("./database/database");
const logger = require("./util/logger");
const config = require("./config");
const utils = require("./util/utils");

const express = require('express');
const expressAuth = require('express-basic-auth');

const bodyParser = require('body-parser');
const fs = require('fs');

const v1Realtime = require("./endpoint/geojson/realtime");
const v1Lines = require("./endpoint/geojson/lines");
const v1Receiver = require("./endpoint/geojson/receiver");
const v1Stops = require("./endpoint/geojson/stops");

const vdv = require("./endpoint/vdv/vdv");

const v2Realtime = require("./endpoint/v2/realtime");

const appRealtime = require("./endpoint/app/realtime");
const appBeacons = require("./endpoint/app/beacons");

const ExtrapolatePositions = require("./operation/ExtrapolatePositions");

utils.startErrorReporting();

process.on('uncaughtException', (err) => {
    logger.error('Caught exception: ');
    console.log(err);

    utils.handleError(err)
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at: Promise', promise, 'reason:', reason);
});


// ====================================================== ARGS =========================================================

let args = yargs
    .command('serve', 'Starts the server', (yargs) => {
        yargs.option('port', {
            describe: 'Port to bind the server on',
            default: 80,
            type: 'number'
        }).check(function (argv) {
            return !isNaN(parseFloat(argv.port)) && isFinite(argv.port);
        })
    }, (argv) => {
        startDatabase()
    })
    .strict(true)
    .demandCommand()
    .option('verbose', {
        alias: 'v',
        default: false
    })
    .argv;


// ======================================================= APP =========================================================

const app = express();

app.use(logRequests);
app.use(checkForRunningImport);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.raw({
    limit: '10mb'
}));


let users = {};
users[config.vdv_import_username] = config.vdv_import_password;


app.use("/vdv/import", expressAuth({users: users}));
app.use("/firebase", expressAuth({users: users}));


// TODO: Add better method to server GTFS (and upload)
app.use('/gtfs', express.static('static/gtfs'));


app.set('jsonp callback name', 'jsonp');

app.group("/vdv", (router) => {
    router.post("/import", vdv.upload);
    router.get("/validity/:date", vdv.validity);
    router.get("/testZip", vdv.testZip);
    router.get("/zip", vdv.asZip);
});

app.group("/geojson", (router) => {
    router.get("/realtime", v1Realtime.positions);
    router.get("/realtime/lines/:lines", v1Realtime.positions);
    router.get("/realtime/vehicle/:vehicle", v1Realtime.positions);

    router.post("/receiver", v1Receiver.updatePositions);

    router.get("/stops", v1Stops.stops);
    router.get("/:stop/buses", v1Stops.nextBusesAtStop);
    router.get("/:tripId/stops", v1Stops.stopsForTrip);

    router.get("/lines/all", v1Lines.fetchAllLinesAction);
    router.get("/lines", v1Lines.fetchLinesAction);
});

app.group("/app", (router) => {
    router.get("/realtime", appRealtime.positions);
    router.get("/realtime/delays", appRealtime.delays);

    router.get("/realtime/line/:lines", appRealtime.positions);
    router.get("/realtime/trip/:trip", appRealtime.positions);
    router.get("/realtime/vehicle/:vehicle", appRealtime.positions);

    router.post("/beacons/buses", appBeacons.insertBuses);
    router.post("/beacons/busstops", appBeacons.insertBusStops);
});

app.group("/gtfs", (router) => {
    router.get("/realtime", v2Realtime.positions);
});

app.group("/firebase", (router) => {
    router.get("/sync", function (req, res) {
        require("./util/firebase").syncAll();

        res.status(200).json({success: true});
    });
});


app.use(function (req, res) {
    logger.error(`404: ${req.method} ${req.url}`);

    res.status(404).json({
        error: {
            code: 404,
            message: "The requested URL was not found on this server."
        }
    });
});


// =================================================== FUNCTIONS =======================================================

function startDatabase() {
    database.connect().then(() => {
        logger.warn("Connected to database");

        startCommands();
        startServer();
    });
}

function startServer() {

    let listener = app.listen(args.port, function () {
        logger.warn(`Server started on port ${listener.address().port}`)
    })
}

function startCommands() {
    new ExtrapolatePositions().run();
}


// =================================================== MIDDLEWARE ======================================================

function logRequests(req, res, next) {
    logger.warn(`${req.method} ${req.url}`);
    next();
}

function checkForRunningImport(req, res, next) {
    if (config.vdv_import_running) {
        // logger.info(`Import is running, skipping request '${req.url}'`);
        res.status(503).json({success: false, error: "VDV import is running. Please wait for it to complete."});

        return;
    }

    next();
}