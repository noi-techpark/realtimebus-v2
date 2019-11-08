'use strict';

const geometries = require("../util/geometries");

async function run() {
    await geometries.update();
}

run();