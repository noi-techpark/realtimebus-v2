'use strict';

module.exports = class LineUtils {

    static getLinesFromQuery(linesStr) {
        let lines = [];

        if (!linesStr) {
            let regex = /^d+:[a-z0-9]+(,d+:[a-z0-9]+)*$/i;

            if (!regex.test(linesStr)) {
                throw(`${linesStr} has invalid format`);
            }

            let lineFragments = linesStr.split(',');
            for (let lineFragment of lineFragments) {
                let exploded = lineFragment.split(":");
                let line = {
                    li_nr: exploded[0],
                    str_li_var: exploded[1]
                };

                lines.push(line);
            }
        } else {
            console.warn("Line filter is active but no lines requested")
        }

        return lines;
    }

    static whereLines(field1, field2, lines) {
        let isFirst = true;
        let whereLines = '';

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