'use strict';

require("moment");

const AdmZip = require("adm-zip");
const connection = require("../../database/database.js");
const fs = require("fs");
const HttpError = require("../../util/utils");
const logger = require("../../util/logger");
const moment = require("moment-timezone");
const reader = require("readline");
const VdvFile = require("../../model/vdv/VdvFile");

const LATEST_VDV_ZIP = 'vdv/latest.zip';
const LATEST_EXTRACTED_VDV_DATA = 'vdv/latest';
const VDV_FILES = LATEST_EXTRACTED_VDV_DATA + '/vdv';

// import vdv data
// curl --header "Content-Type:application/octet-stream" --data-binary @/Users/David/Desktop/vdv.zip http://10.1.1.162:88/vdv

const VALIDITY = "BASIS_VER_GUELTIGKEIT.X10";
const CALENDAR = "FIRMENKALENDER.X10";
const PATHS = "LID_VERLAUF.X10";
const AREAS = "MENGE_BEREICH.X10";
const TRIP_TYPES = "MENGE_FAHRTART.X10";
const TRIP_PEEK_TIMES = "MENGE_FGR.X10";
const VEHICLE_TYPES = "MENGE_FZG_TYP.X10";
const LINE_SERVICES = "MENGE_LEISTUNGSART.X10";
const STOP_TYPES = "MENGE_ONR_TYP.X10";
const BUS_STOP_TYPES = "MENGE_ORT_TYP.X10";
const DAY_TYPES = "MENGE_TAGESART.X10";
const COMPANIES = "MENGE_UNTERNEHMER.X10";
const BREAKS = "ORT_HZTF.X10";
const TRIP_INFO_REDUCED = "REC_FRT_BEDIENUNG.X10";
const BUS_STOP_STOP_TIMES = "REC_FRT_HZT.X10";
const TRIP_INFO_EXTENDED = "REC_FRT.X10";
const STOP_POINTS = "REC_HP.X10";
const LINES = "REC_LID.X10";
const VARIANTS = "REC_LIVAR_FGR.X10";
const BUS_STOPS = "REC_ORT.X10";
const BUS_STOP_CONNECTIONS = "REC_SEL.X10";
const TRAVEL_TIMES = "SEL_FZT_FELD.X10";
const TEQ_MAPPING = "teqnummern.csv";
const SERVICE_PROVIDERS = "ZUL_VERKEHRSBETRIEB.X10";

const VALID_FROM = "VER_GUELTIGKEIT";

const vdvFileList = [VALIDITY, CALENDAR, PATHS, AREAS, TRIP_TYPES, TRIP_PEEK_TIMES, VEHICLE_TYPES, LINE_SERVICES,
    STOP_TYPES, BUS_STOP_TYPES, DAY_TYPES, COMPANIES, BREAKS, TRIP_INFO_REDUCED, BUS_STOP_STOP_TIMES,
    TRIP_INFO_EXTENDED, STOP_POINTS, LINES, VARIANTS, BUS_STOPS, BUS_STOP_CONNECTIONS, TRAVEL_TIMES, SERVICE_PROVIDERS];

let response = {};
let sqlCreateChain = [];
let sqlInsertChain = [];

module.exports = {

    upload: function (req, res) {
        let data = [];

        return new Promise(function (resolve, reject) {
            fs.writeFile(LATEST_VDV_ZIP, req.body, function (err) {
                try {
                    if (err) {
                        return reject(err);
                    }

                    logger.debug("Saved zip file containing VDV data");

                    new AdmZip(LATEST_VDV_ZIP).extractAllTo(LATEST_EXTRACTED_VDV_DATA, true);
                    logger.debug("Extracted latest VDV data");

                    resolve()
                } catch (e) {
                    reject(new HttpError("No zip file was found in the request's body. Be sure to add it and set the header 'Content-Type' to 'application/octet-stream'.", 400))
                }
            })
        }).then(() => {
            return new Promise(function (resolve, reject) {
                fs.writeFile('vdv/' + new Date().toISOString() + '.zip', req.body, function (err) {
                    try {
                        if (err) {
                            return reject(err);
                        }

                        logger.debug("Archived zip file containing VDV data");

                        resolve()
                    } catch (e) {
                        reject(new HttpError("The zip file could not be written to disk. Please try again later."))
                    }
                })
            })
        }).then(() => {
            return new Promise(function (resolve, reject) {
                fs.readdir(VDV_FILES, (err, files) => {
                    try {
                        if (err) {
                            return reject(err);
                        }

                        logger.debug(`Found ${files.length} files`);

                        vdvFileList.forEach(file => {
                            if (!files.indexOf(file) === -1) {
                                return reject(new Error(`The file ${file} is missing. VDV import was aborted. No changes have been applied to the current data.`));
                            }
                        });

                        let chain = Promise.resolve();

                        vdvFileList.forEach(file => {
                            chain = chain.then(() => {
                                return new Promise(function (resolve, reject) {
                                    parseVdvFile(file, data, function (fileName, table, columns, rows, data) {
                                        if (rows.length === 0) {
                                            return reject(new HttpError(`Table ${table} does not contain any records. VDV import was aborted. No changes have been applied to the current data.`, 400));
                                        }

                                        data.push(new VdvFile(fileName, table, columns, rows));

                                        logger.debug(`Processed table ${table}`);

                                        resolve();
                                    })
                                })
                            });
                        });

                        logger.debug(`Successfully read ${vdvFileList.length} VDV files`);

                        chain = chain.then(() => {
                            resolve()
                        }).catch(error => {
                            reject(error)
                        })
                    } catch (e) {
                        reject(new HttpError("Failed to read from disk. Please try again later."))
                    }
                })
            })
        }).then(() => {
            return connection.query(`DROP SCHEMA IF EXISTS data CASCADE;`);
        }).then(() => {
            return connection.query(`CREATE SCHEMA data;`);
        }).then(() => {
            return connection.query(`CREATE TABLE data.config (key text, value text);`);
        }).then(() => {
            return new Promise(function (resolve) {
                data.forEach(function (file) {
                    //noinspection FallThroughInSwitchStatementJS
                    switch (file.name) {
                        case VALIDITY:
                            response.data_valid_from = moment(file.rows[0][file.columns.indexOf(VALID_FROM)]).tz("Europe/Rome").format();
                            logger.info(`Data is valid as of ${response.data_valid_from}`);
                            break;
                        case CALENDAR:
                            response.calendar_days_amount = file.rows.length;
                            response.calendar_days_first = moment(file.rows[0][file.columns.indexOf('BETRIEBSTAG')]).tz("Europe/Rome").format();
                            response.calendar_days_last = moment(file.rows[file.rows.length - 1][file.columns.indexOf('BETRIEBSTAG')]).tz("Europe/Rome").format();

                            logger.debug(`Calendar contains ${file.rows.length} days.`);

                            if (response.data_valid_from !== response.calendar_days_first) {
                                logger.warn("Validity begin of uploaded data and first day in calendar do not match. Did you mess up the previous upload?");
                            }

                            if (response.calendar_days_first === response.calendar_days_last) {
                                logger.warn("The first day in the calendar is equal to the last one. Are you sure you uploaded the correct calendar data?");
                            }
                        default:
                            // create table
                            let sql1 = `CREATE TABLE data.${file.table.toLowerCase()} (`;

                            file.columns.forEach(function (column) {
                                sql1 += `${column} text, `
                            });

                            sql1 = sql1.slice(0, -2) + ");";

                            sqlCreateChain.push(sql1);

                            // insert into
                            let sql2 = `INSERT INTO data.${file.table.toLowerCase()} VALUES `;

                            file.rows.forEach(function (row) {
                                sql2 += '(';

                                row.forEach(function (cell) {
                                    if (cell !== null) {
                                        cell = cell.replace(/'/g, "''");
                                    }

                                    sql2 += `'${cell}', `
                                });

                                sql2 = sql2.slice(0, -2) + '), ';
                            });

                            sql2 = sql2.slice(0, -2);

                            sqlInsertChain.push(sql2);

                            break;
                    }
                });

                resolve()
            })
        }).then(() => {
            return connection.query(`INSERT INTO data.config VALUES
                ('data_valid_from', '${response.data_valid_from}')
            `)
        }).then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlCreateChain) {
                chain = chain.then(() => {
                    return connection.query(sql)
                })
            }

            return chain
        }).then(() => {
            logger.info("Created tables");
        }).then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlInsertChain) {
                chain = chain.then(() => {
                    return connection.query(sql)
                })
            }

            return chain
        }).then(() => {
            logger.info("Filled tables");
        }).then(() => {
            response.success = true;
            res.status(200).json(sortObject(response))
        }).catch(err => {
            logger.error(err);
            res.status(err.status).json({success: false, error: err})
        });
    }
};

function parseVdvFile(file, data, cb) {
    let table = null;
    let columns = [];
    let records = [];

    reader.createInterface({
        input: fs.createReadStream(VDV_FILES + '/' + file)
    }).on('line', function (line) {
        let csv = line.split("; ");

        switch (csv.shift()) {
            case "tbl": // table
                table = csv.shift();
                break;
            case "atr": // attributes (columns in database)
                columns = csv;
                break;
            case "rec": // record
                records.push(csv.map(function (val) {
                    val = val.replace(/\"/g, "").trim();
                    return val === "" || val === "null" ? null : val;
                }));
                break;
            default: // other lines are ignored
                break;
        }
    }).on('close', function () {
        cb(file, table, columns, records, data);
    })
}

function sortObject(o) {
    let sorted = {}, key, a = [];

    for (key in o) {
        if (o.hasOwnProperty(key)) {
            a.push(key);
        }
    }

    a.sort();

    for (key = 0; key < a.length; key++) {
        sorted[a[key]] = o[a[key]];
    }

    return sorted;
}