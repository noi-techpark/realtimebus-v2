'use strict';

module.exports = class VdvFile {
    constructor(name, table, columns, rows) {
        this.name = name;
        this.table = table;
        this.columns = columns;
        this.rows = rows;
    }
};