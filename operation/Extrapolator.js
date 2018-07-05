'use strict';

const database = require("../database/database");
const logger = require("../util/logger");
const config = require("../config");

module.exports = class Extrapolator {

    constructor() {
        this.interval = 1000;
        this.client = null;

        this.tag = "EXTRAPOLATION";
    }

    run() {
        this.runExtrapolation();
    }

    async connect() {
        logger.info(`${this.tag}: Connecting to database`);

        this.client = await database.connect();
        await this.client.query("SET client_min_messages TO ERROR;");
    }

    async runExtrapolation() {
        let instance = this;

        if (config.vdv_import_running) {
            logger.warn(`${this.tag}: Not executing extrapolation because import is running`);

            setTimeout(() => instance.runExtrapolation(), this.interval);

            return;
        }

        try {
            if (this.client == null) {
                await this.connect();
            }

            let result = await this.client.query("SELECT data.data_extrapolate_positions()");

            logger.info(`${this.tag}: Updated ${result.rows[0].data_extrapolate_positions} positions`);
        } catch (e) {
            logger.error(`${this.tag}: Error: ${e}`);

            await this.client.release();
            this.client = null;
        }

        setTimeout(() => instance.runExtrapolation(), this.interval);
    }
};