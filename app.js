'use strict';

const express = require('express');
const connection = require("./database/connection");
const logger = require("./util/logger");

const v1Receiver = require("./v1/receiver");

require('express-group-routes');
const app = express();

connection.connect(function (error) {
    if (error) throw error;

    logger.warn("Connected to database");

    startServer();
});

function startServer() {
    app.group("/v1", (router) => {

        router.get("/receiver",function (req, res) {
            v1Receiver.receiver(req, res);
        });

    });

    app.listen(80, function () {
        logger.warn('Example app listening on port 80!')
    });
}