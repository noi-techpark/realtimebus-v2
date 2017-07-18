'use strict';

let logConfig = {
    format: [
        "{{timestamp}} {{title}}: {{message}} ({{file}}:{{line}})"
    ],
    dateformat: "HH:MM:ss",
    preprocess: function (data) {
        data.title = data.title.toUpperCase();
    }
};

const logger = require('tracer').colorConsole(logConfig);

module.exports = logger;