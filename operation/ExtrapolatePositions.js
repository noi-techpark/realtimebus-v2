'use strict';

const database = require("../database/database");
const logger = require("../util/logger");

module.exports = class ExtrapolatePositions {

    constructor(lifeTime) {
        this.lifeTime = lifeTime || 300;
    }

    run() {
        return database.connect()
            .then(client => {
                return this.runExtrapolation(client)
            })
            .catch(error => {
                logger.error(`Error acquiring extrapolation client: ${error}`);
            });
    }

    runExtrapolation(client) {
        return Promise.resolve()
            .then(client.query("SET client_min_messages TO ERROR;"))
            .then(() => {
                let scriptStart = new Date().getTime();
                let period = 1.3;

                let loops = 0;

                (function loop() {
                    let iterationStart = new Date().getTime();

                    client.query("SELECT data.data_extrapolate_positions()", function (err, result) {
                        let now = new Date().getTime();
                        let timeLeft = Math.max(1, period - (now - iterationStart));

                        let updateText;
                        if (typeof result === 'undefined') {
                            logger.error(`Interpolation did not return any result`);
                        } else {
                            updateText = `, updated ${result.rows[0].data_extrapolate_positions} positions`;
                        }

                        logger.log(`Loops: ${loops++}, time left: ${timeLeft} (${now - scriptStart})${updateText}`);

                        setTimeout(function () {
                            now = new Date().getTime();

                            if (now - scriptStart > this.lifeTime) {
                                logger.error("End of extrapolation script life reached");
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
    }
};