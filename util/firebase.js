'use strict';

const request = require('request');

const logger = require("./logger");
const config = require("../config");


// ===================================================== SYNC ==========================================================

module.exports.syncAll = function () {
    exports.sync(config.firebase_messaging_key_sasabus);
    exports.sync(config.firebase_messaging_key_sasabz);
};

module.exports.sync = function (key) {
    let config = {
        url: 'https://fcm.googleapis.com/fcm/send',
        method: 'POST',
        headers: {
            'Content-Type': ' application/json',
            'Authorization': 'key=' + key
        },
        body: JSON.stringify({
            data: {
                receiver: 'sync',
                jitter: 2 * 60 * 1000
            },
            to: '/topics/general'
        })
    };

    request(config, function (error, response, body) {
        if (error) {
            logger.error("Could not execute sync: " + error);
        } else if (response.statusCode >= 400) {
            logger.error('Sync HTTP error: ' + response.statusCode + ' - ' + response.statusMessage + '\n' + body);
        } else {
            logger.log(`Sync successful: ${body}`)
        }
    });
};