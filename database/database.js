const Pool = require('pg-pool');
const NativeClient = require('pg').native.Client;

const logger = require("../util/logger");

const pool = new Pool({
    user: 'postgres',                       // env var: PGUSER
    database: 'realtimebus',                // env var: PGDATABASE
    password: '1234',                       // env var: PGPASSWORD
    host: 'localhost',                      // Server hosting the postgres database
    port: 5432,                             // env var: PGPORT
    max: 16,                                // max number of clients in the pool
    idleTimeoutMillis: 5 * 60 * 1000,      // how long a client is allowed to remain idle before being closed
    Client: NativeClient
});

pool.on('error', function(error, client) {
    logger.error(`SQL error: ${error}`)
});

pool.on('connect', client => {
    logger.info(`Connected client: ${client}`)
});

module.exports.connect = function(err, client, done) {
    return pool.connect(err, client, done)
};

// export the query method for passing queries to the pool
module.exports.query = function (text, values, callback) {
    return pool.query(text, values, callback);
};

logger.info("Created new database pool");