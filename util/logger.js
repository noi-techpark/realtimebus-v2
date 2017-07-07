'use strict';

let logConfig = {
    format: [
        "{{timestamp}} {{title}}: {{message}} ({{file}}:{{line}})",
        {
            error: "{{timestamp}} <{{title}}> {{message}} (in {{file}}:{{line}})\nCall Stack:\n{{stack}}"
        }
    ],
    dateformat: "HH:MM:ss",
    preprocess: function (data) {
        data.title = data.title.toUpperCase();
    }
};

const logger = require('tracer').colorConsole(logConfig);

module.exports = logger;