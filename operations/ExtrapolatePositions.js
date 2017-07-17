'use strict';

const database = require("../database/database");
const logger = require("../util/logger");

module.exports = class ExtrapolatePositions {

    constructor(lifeTime) {
        this.lifeTime = lifeTime || 300;
    }

    run() {
        let scriptStart = new Date().getTime();
        let period = 1.3;

        // TODO: Quiet logging (maybe fix deprecation warnings)

        return database.connect()
            .then(client => {
                return Promise.resolve()
                    .then(client.query("SET client_min_messages TO ERROR;"))
                    .then(() => {
                        let loops = 0;

                        (function loop() {
                            let iterationStart = new Date().getTime();

                            client.query("SELECT data.data_extrapolate_positions()", function (err, result) {
                                let now = new Date().getTime();
                                let timeLeft = Math.max(1, period - (now - iterationStart));

                                logger.warn(`Loops: ${loops++}, time left: ${timeLeft} (${now - scriptStart}), updated ${result.rowCount} positions`);

                                setTimeout(function () {
                                    now = new Date().getTime();

                                    logger.warn(`Loops: ${loops++}, time left: ${timeLeft} (${now - scriptStart}), updated ${result.rowCount} positions`);

                                    if (now - scriptStart > this.lifeTime) {
                                        console.error("End of script life reached");
                                    } else {
                                        loop();
                                    }
                                }, timeLeft * 1000);
                            });
                        }());
                    })
                    .catch(error => {
                        logger.error(`Extrapolation error: ${error}`)
                    })
            })
            .catch(error => {
                logger.error(`Error acquiring extrapolation client: ${error}`);
            });
    }
};