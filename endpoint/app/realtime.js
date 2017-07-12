'use strict';

const database = require("../../database/database");
const logger = require('../../util/logger');
const config = require("../../config");

const LineUtils = require("../../model/realtime/LineUtils");
const NewPositions = require("../../model/realtime/new/NewPositions");

module.exports = {

    positions: function (req, res) {
        database.connect().then(client => {
           return Promise.resolve().then(() => {
               let positions = new NewPositions(client);

               let lines = req.query.lines;

               if (typeof lines !== 'undefined' && lines.length > 0) {
                   positions.setLines(LineUtils.getLinesFromQuery(lines));
               }

               return positions.getAll();
           }).then(positions => {
               client.release();
               res.status(200).jsonp(positions);
           }).catch(error => {
               client.release();

               logger.error(error);
               res.status(500).jsonp({success: false, error: error})
           })
        }).catch(error => {
            logger.error(`Error acquiring client: ${error}`);
            res.status(500).jsonp({success: false, error: error})
        })
    }
};