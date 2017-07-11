'use strict';

const logger = require("../../util/logger");

module.exports = class LineUtils {

    static getLinesFromQuery(lineString) {
        let lines = [];

        if (typeof lineString !== 'undefined' && lineString.length > 0) {
            let regex = /\d+:[0-9]+(,\d+:[0-9]+)*$/;

            if (!regex.test(lineString)) {
                throw(`Filter '${lineString}' does not match required filter format '${regex}'`);
            }

            let lineFragments = lineString.split(',');
            for (let lineFragment of lineFragments) {
                let exploded = lineFragment.split(":");
                let line = {
                    li_nr: exploded[0],
                    str_li_var: exploded[1]
                };

                lines.push(line);
            }
        } else {
            logger.error("Line filter is active but no lines requested")
        }

        return lines;
    }

    static whereLines(field1, field2, lines) {
        let isFirst = true;
        let whereLines = '';

        if (lines.count === 0) {
            logger.error("Line filter is active but no lines requested");
            return whereLines;
        }

        for (let lineData of lines) {
            if (isFirst) {
                isFirst = false;
            } else {
                whereLines += " OR\n    ";
            }

            whereLines += `(${field1}=${lineData.li_nr} AND ${field2}='${lineData.str_li_var}')`;
        }

        return whereLines;
    }
};