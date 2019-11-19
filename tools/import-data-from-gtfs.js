const database = require("../database/database.js");
const vdv = require("../endpoint/vdv/vdv");

database.connect()
    .then((client) => {
        return Promise.resolve()
            .then(() => {
                return vdv.importDataFromGtfs(client);
            })
            .then(() => {
                client.release();
                process.exit(0);
            });
    });