'use strict';

let logConfig = {
    format: [
        "{{title}}: {{message}} ({{file}}:{{line}})"
    ],
    preprocess: function (data) {
        data.title = data.title.toUpperCase().padEnd(5, " ");
    }
};

const logger = require('tracer').colorConsole(logConfig);

module.exports = logger;