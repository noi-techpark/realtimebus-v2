'use strict';

module.exports = class VdvFile {

    constructor(name, table, formats, columns, rows) {
        this.name = name;
        this.table = table;
        this.formats = formats;
        this.columns = columns;
        this.rows = rows;
    }
};