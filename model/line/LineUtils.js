'use strict';

const logger = require("../../util/logger");
const utils = require("../../util/utils");

module.exports = {

    fromExpressQuery: function (query) {
        if (utils.isEmpty(query)) {
            logger.error("Line filter is active but no lines requested");
            return [];
        }

        let lines = [];
        let regex = /\d+:[0-9]+(,\d+:[0-9]+)*$/;

        if (!regex.test(query)) {
            throw(`Filter '${query}' does not match required filter format '${regex}'`);
        }

        let lineFragments = query.split(',');
        for (let lineFragment of lineFragments) {
            let exploded = lineFragment.split(":");
            let line = {
                line: exploded[0],
                variant: exploded[1]
            };

            lines.push(line);
        }

        return lines;
    },

    buildForSql: function (field1, field2, lines) {
        let isFirst = true;
        let whereLines = '';

        if (utils.isEmpty(lines)) {
            logger.error("Line filter is active but no lines requested");
            return whereLines;
        }

        for (let lineData of lines) {
            if (isFirst) {
                isFirst = false;
            } else {
                whereLines += " OR\n    ";
            }

            whereLines += `(${field1}=${lineData.line} AND ${field2}='${lineData.variant}')`;
        }

        return whereLines;
    }
};