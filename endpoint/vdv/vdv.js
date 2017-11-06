'use strict';

require("moment");

const path = require('path');
const mime = require('mime');

const moment = require('moment');
require("moment-timezone");

const AdmZip = require("adm-zip");
const fs = require("fs");
const http = require("http");
const reader = require("readline");

const spawn = require('child_process').spawnSync;

const VdvFile = require("../../model/vdv/VdvFile");
const HttpError = require("../../util/HttpError");

const ExtrapolatePositions = require("../../operation/ExtrapolatePositions");

const logger = require("../../util/logger");
const config = require("../../config");
const database = require("../../database/database.js");
const utils = require("../../util/utils");
const firebase = require("../../util/firebase");

const VDV_ROOT = 'vdv';
const VDV_APP_ROOT = `${VDV_ROOT}/app`;

const LATEST_VDV_ZIP = `${VDV_ROOT}/latest.zip`;
const LATEST_EXTRACTED_VDV_DATA = `${VDV_ROOT}/latest`;
const VDV_FILES = LATEST_EXTRACTED_VDV_DATA + '/vdv';
const VDV_ARCHIVED_DATE = new Date().toISOString();
const VDV_ARCHIVED_DIR = VDV_ROOT + '/' + VDV_ARCHIVED_DATE;
const VDV_ARCHIVED_ZIP = VDV_ARCHIVED_DIR + '.zip';

const APP_ZIP_FILE = `${VDV_APP_ROOT}/data.zip`;

// import vdv data
// curl --user sasa:sasabz2016! --header "Content-Type:application/octet-stream" --data-binary @/path/to/vdv.zip http://10.4.1.2/vdv/import

const VALIDITY = "BASIS_VER_GUELTIGKEIT.X10";
const CALENDAR = "FIRMENKALENDER.X10";
const PATHS = "LID_VERLAUF.X10";
const TRIP_TYPES = "MENGE_FAHRTART.X10";
const TRIP_PEEK_TIMES = "MENGE_FGR.X10";
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

const VALID_FROM = "VER_GUELTIGKEIT";

const VDV_COORDINATES_FORMAT = config.coordinate_wgs84;
const DB_COORDINATES_FORMAT = 25832;

const vdvFileList = [
    VALIDITY, DAY_TYPES, CALENDAR, LINES, BUS_STOPS, PATHS, TRIP_TYPES, TRIP_PEEK_TIMES, LINE_SERVICES,
    STOP_TYPES, BUS_STOP_TYPES, COMPANIES, BREAKS, TRIP_INFO_REDUCED, TRIP_INFO_EXTENDED, BUS_STOP_STOP_TIMES,
    STOP_POINTS, VARIANTS, BUS_STOP_CONNECTIONS, TRAVEL_TIMES
];

let response = {};

let sqlTruncateChain = [];
let sqlCreateChain = [];
let sqlInsertChain = [];


module.exports.upload = function (req, res) {
    let data = [];

    config.vdv_import_running = true;

    return database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    sqlTruncateChain.clear();
                    sqlCreateChain.clear();
                    sqlInsertChain.clear();
                })

                .then(() => {
                    return saveZipFiles(req)
                })
                .then(() => {
                    return parseVdvFiles(data)
                })

                .then(() => {
                    return new Promise(function (resolve) {
                        response.data_uploaded_at = moment().format();

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

                                    logger.info(`Calendar contains ${file.rows.length} days.`);

                                    if (response.data_valid_from !== response.calendar_days_first) {
                                        logger.warn("Validity begin of uploaded data and first day in calendar do not match. Did you mess up the previous upload?");
                                    }

                                    if (response.calendar_days_first === response.calendar_days_last) {
                                        throw new HttpError("The first day in the calendar is equal to the last one. Are you sure you uploaded the correct calendar data?", 400);
                                    }

                                    //if (moment(response.calendar_days_first).isAfter(moment(new Date()).add(-1, "days"))) {
                                    //    throw new HttpError("The first day in the calendar is in the future. You are only allowed to upload data whose validity begin is past or within the next 24 hours.", 400);
                                    //}

                                    if (moment(response.calendar_days_last).isBefore(new Date())) {
                                        throw new HttpError("The last day in the calendar is in the past. You are not allowed to upload expired data. Try using another calendar.", 400);
                                    }
                                default:
                                    // CREATE
                                    let sql1 = `CREATE TABLE IF NOT EXISTS data.${file.table.toLowerCase()} (`;

                                    file.columns.forEach(function (column) {
                                        sql1 += `${column} ${file.formats[file.columns.indexOf(column)]}, `
                                    });

                                    sql1 = sql1.slice(0, -2) + ");";

                                    sqlCreateChain.push(sql1);

                                    // TRUNCATE
                                    sqlTruncateChain.push(`TRUNCATE TABLE data.${file.table.toLowerCase()} CASCADE;`);

                                    // INSERT
                                    let sql2 = `INSERT INTO data.${file.table.toLowerCase()} VALUES `;

                                    file.rows.forEach(function (row) {
                                        sql2 += '(';

                                        row.forEach(function (cell) {
                                            if (cell === null) {
                                                sql2 += "null, ";
                                                return
                                            }

                                            cell = cell.replace(/'/g, "''");
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
                })
                .then(() => {
                    return insertVdvData(client)
                })

                .then(() => {
                    return fillConfigTable(client)
                })

                .then(() => {
                    return performOtherQueries(client)
                })

                .then(() => {
                    return fillTeqData(client)
                })

                .then(() => {
                    logger.warn("=========================================================");
                    logger.warn("==================== Import succeeded! ==================");
                    logger.warn("================ Data calculation running! ==============");
                    logger.warn("=========================================================");

                    response.success = true;

                    let json = utils.sortObject(response);

                    res.status(200).json(json);

                    return json;
                })
                .then(json => {
                    return sendSuccessMail(json);
                })
                .then(() => {
                    return performDataCalculation(client);
                })
                .then(() => {
                    new ExtrapolatePositions().run();

                    firebase.syncAll();

                    config.vdv_import_running = false;

                    client.release();
                })

                .catch(err => {
                    logger.error("=========================================================");
                    logger.error("==================== Import failed! =====================");
                    logger.error("=========================================================");

                    logger.error(err);

                    config.vdv_import_running = false;

                    utils.respondWithError(res, err);

                    client.release();

                    sendFailureMail(err);
                });
        })
        .catch(error => {
            config.vdv_import_running = false;

            logger.error(`Error acquiring client: ${error}`);

            utils.respondWithError(res, error);
            utils.handleError(error);

            sendFailureMail(error);
        })
};

module.exports.validity = function (req, res) {
    let date = req.params.date;

    if (!utils.checkForParam(res, date, 'date')) {
        return;
    }

    if (!utils.checkIfParamIsNumber(res, date, 'date')) {
        return;
    }

    return database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    return client.query(`SELECT key FROM data.config WHERE key = 'data_uploaded_at'`);
                })
                .then(result => {
                    res.status(200).json({valid: moment.unix(req.params.date).isAfter(moment(result.rows[0]))});

                    client.release();
                })
                .catch(error => {
                    utils.respondWithError(res, error);

                    client.release();
                });
        })
        .catch(error => {
            utils.respondWithError(res, error);
            utils.handleError(error)
        })
};


module.exports.generateAppZip = function (req, res) {
    return database.connect()
        .then(client => {
            return generateZipForApp(client)
                .then(lines => {
                    logger.warn("Zip generated");
                    res.status(200).json(lines);

                    client.release()
                })
                .catch(error => {
                    logger.error("Zip generation failed!");
                    logger.error(error);

                    utils.respondWithError(res, error);

                    client.release()
                });
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);

            utils.respondWithError(error);
            utils.handleError(error);
        })
};

module.exports.downloadAppZip = function (req, res) {
    let file = APP_ZIP_FILE;

    if (!fs.existsSync(file)) {
        logger.warn(`${file} does not exist`);
        res.status(503);
        return;
    }

    let fileName = path.basename(file);
    let mimeType = mime.lookup(file);
    let size = fs.statSync(file);

    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', size.size);

    let fileStream = fs.createReadStream(file);
    fileStream.pipe(res);
};


// ================================================== VDV IMPORT =======================================================

// <editor-fold desc="VDV IMPORT">

function saveZipFiles(req) {
    if (!fs.existsSync(VDV_ROOT)) {
        logger.info(`Creating directory '${VDV_ROOT}'`);
        fs.mkdirSync(VDV_ROOT);
    }

    return new Promise(function (resolve, reject) {
        fs.writeFile(LATEST_VDV_ZIP, req.body, function (err) {
            if (err) {
                return reject(err);
            }

            try {
                logger.debug("Saved zip file containing VDV data");
                new AdmZip(LATEST_VDV_ZIP).extractAllTo(LATEST_EXTRACTED_VDV_DATA, true);
                logger.debug("Extracted latest VDV data");
            } catch (e) {
                return reject(new HttpError("No zip file was found in the request's body. Be sure to add it and set the header 'Content-Type' to 'application/octet-stream'.", 400))
            }

            logger.debug("Recoding VDV files");

            const command = `recode ms-ansi..UTF-8 ${VDV_FILES}/*.X10`;
            const recode = spawn('/bin/sh', ['-c', command]);

            console.log(`Recode: stdout: ${recode.stdout.toString()}`);

            if (recode.status !== 0) {
                return reject(new HttpError(`Recode exited with status code '${recode.status}', stderr=${recode.stderr.toString()}`, 500))
            }

            resolve()
        })
    }).then(() => {
        return new Promise(function (resolve, reject) {
            fs.writeFile(VDV_ARCHIVED_ZIP, req.body, function (err) {
                try {
                    if (err) {
                        return reject(err);
                    }

                    logger.debug("Archived zip file containing VDV data");

                    resolve()
                } catch (e) {
                    reject(new HttpError("The zip file could not be written to disk. Please try again later."))
                }
            });
        })
    }).then(() => {
        return new Promise(function (resolve, reject) {
            try {
                new AdmZip(VDV_ARCHIVED_ZIP).extractAllTo(VDV_ARCHIVED_DIR, true);
                logger.debug("Extracted archived VDV data");

                resolve();
            } catch (e) {
                return reject(new HttpError("No zip file was found in the request's body. Be sure to add it and set the header 'Content-Type' to 'application/octet-stream'.", 400))
            }
        })
    })
}

function parseVdvFiles(data) {
    return new Promise(function (resolve, reject) {
        fs.readdir(VDV_FILES, (err, files) => {
            try {
                if (err) {
                    return reject(err);
                }

                logger.debug(`Found ${files.length} files`);

                if (files.indexOf(TEQ_MAPPING) === -1) {
                    return reject(new Error(`The file ${TEQ_MAPPING} is missing. VDV import was aborted. No changes have been applied to the current data.`));
                }

                vdvFileList.forEach(file => {
                    if (!files.indexOf(file) === -1) {
                        return reject(new Error(`The file ${file} is missing. VDV import was aborted. No changes have been applied to the current data.`));
                    }
                });

                let chain = Promise.resolve();

                vdvFileList.forEach(file => {
                    chain = chain.then(() => {
                        return new Promise(function (resolve, reject) {
                            parseVdvFile(file, function (fileName, table, formats, columns, rows) {
                                if (rows.length === 0) {
                                    return reject(new HttpError(`Table ${table} does not contain any records. VDV import was aborted. No changes have been applied to the current data.`, 400));
                                }

                                data.push(new VdvFile(fileName, table, formats, columns, rows));

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
}

function insertVdvData(client) {
    return Promise.resolve()
        .then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlCreateChain) {
                chain = chain.then(() => {
                    return client.query(sql)
                })
            }

            return chain
        })
        .then(() => {
            logger.debug("Created tables");
        })

        .then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlTruncateChain) {
                chain = chain.then(() => {
                    logger.debug(`SQL: '${sql}'`);
                    return client.query(sql)
                })
            }

            return chain
        })
        .then(() => {
            logger.debug("Truncated tables");
        })

        .then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlInsertChain) {
                chain = chain.then(() => {
                    return client.query(sql)
                })
            }

            return chain
        })
        .then(() => {
            logger.debug("Filled tables");
        })
}

function performOtherQueries(client) {
    return Promise.resolve()
        .then(() => {
            return client.query(`
                    INSERT INTO data.menge_fgr (version, trip_time_group, trip_time_group_text)
                    (
                        SELECT 1, rec_frt.trip_time_group, 'Generated during import on ' || to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD')
                        FROM data.rec_frt
                        
                        LEFT JOIN data.menge_fgr
                            ON rec_frt.trip_time_group = menge_fgr.trip_time_group
                            
                        WHERE menge_fgr.trip_time_group IS NULL
                        
                        GROUP BY rec_frt.trip_time_group
                        ORDER BY rec_frt.trip_time_group
                    );
                    `);
        })
        .then(() => {
            return client.query(`
                    INSERT INTO data.rec_lid (version, line, variant, line_name)
                    (
                        SELECT 1, rec_frt.line, rec_frt.variant, 'Generated during import of ' || to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD')
                        FROM data.rec_frt
                        
                        LEFT JOIN data.rec_lid
                            ON rec_frt.line = rec_lid.line
                            AND rec_frt.variant = rec_lid.variant
                            
                        WHERE rec_lid.line IS NULL
                        
                        GROUP BY rec_frt.line, rec_frt.variant
                        ORDER BY rec_frt.line, rec_frt.variant
                    );
                    `)
        })
}

function fillTeqData(client) {
    return new Promise(function (resolve, reject) {
        logger.info("Starting TEQ conversion");

        let firstLine = true;

        let stream = fs.createReadStream(VDV_FILES + '/' + TEQ_MAPPING);
        stream.on("error", function (error) {
            reject(error)
        });

        let sql = `
            UPDATE data.rec_frt AS rec SET
                  teq = rec2.teq
            FROM (VALUES
        `;

        reader.createInterface({
            input: stream
        }).on('line', function (line) {
            if (!firstLine) {
                let numbers = line.split("\t");
                sql += `(${numbers[0]}, ${numbers[1]}),`;
            }

            firstLine = false;
        }).on('close', function () {
            sql = sql.substr(0, sql.length - 1);

            sql += `
                ) AS rec2(trip, teq)
                WHERE rec2.trip = rec.trip;
            `;

            resolve(sql)
        });
    })
        .then(sql => {
            return client.query(sql)
        })
}

function fillConfigTable(client) {
    return Promise.resolve()
        .then(() => {
            return client.query(`CREATE TABLE IF NOT EXISTS data.config (key text, value text);`);
        })
        .then(() => {
            return client.query(`TRUNCATE TABLE data.config;`);
        })
        .then(() => {
            return client.query(
                `INSERT INTO data.config VALUES 
                    ('calendar_days_amount', '${response.calendar_days_amount}'), 
                    ('calendar_days_first', '${response.calendar_days_first}'), 
                    ('calendar_days_last', '${response.calendar_days_last}'), 
                    ('data_uploaded_at', '${response.data_uploaded_at}'), 
                    ('data_valid_from', '${response.data_valid_from}')`
            )
        })
}

function parseVdvFile(file, cb) {
    let table = null;
    let columns = [];
    let formats = [];
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
                let col = [];

                for (let c of csv) {
                    c = c.replace("AUFTRAGGEBER_NR", "client");
                    c = c.replace("BASIS_VERSION", "version");
                    c = c.replace("BEMERKUNG", "remark");
                    c = c.replace("FAHRTART_NR", "trip_type");
                    c = c.replace("FGR_NR", "trip_time_group");
                    c = c.replace("FREMDUNTERNEHMER_NR", "foreign_company");
                    c = c.replace("FRT_EXT_NR", "trip_external");
                    c = c.replace("FRT_FID", "trip");
                    c = c.replace("FRT_START", "departure");
                    c = c.replace("FZG_TYP_NR", "vehicle_type");
                    c = c.replace("KONZESSIONSINHABER_NR", "licensee");
                    c = c.replace("LEISTUNGSART_NR", "service");
                    c = c.replace("LI_NR", "line");
                    c = c.replace("LIDNAME", "line_name");
                    c = c.replace("LI_KU_NR", "course");
                    c = c.replace("STR_LI_VAR", "variant");
                    c = c.replace("TAGESART_NR", "day_type");
                    c = c.replace("UM_UID", "journey");
                    c = c.replace("ZNR_NR", "display");
                    c = c.replace("ZONE_WABE_NR", "area");
                    col.push(c);
                }

                columns = col;
                break;
            case "frm": // record
                formats = csv.map(function (format) {

                    format = format.slice(0, -1);

                    let split = format.split('[');
                    let dataType = split[0];

                    switch (dataType) {
                        case 'char':
                            return `VARCHAR(${split[1]})`;
                            break;
                        case 'num':
                            let numbers = split[1].split('.');
                            let width = numbers[0];
                            let scale = numbers[1];

                            if (scale === 0) {
                                if (width <= 4) {
                                    return "SMALLINT";
                                }
                                if (width <= 9) {
                                    return "INT";
                                }
                                if (width <= 18) {
                                    return "SMALLINT";
                                }

                                return `DECIMAL(${width})`;
                            }

                            return `DECIMAL(${width}, ${scale})`;
                            break;
                        default:
                            throw new Error(`Table ${table} is malformed. VDV import was aborted. No changes have been applied to the current data.`);
                    }
                });
                break;
            case "rec": // record
                records.push(csv.map(function (cell) {
                    cell = cell.replace(/\"/g, "").trim();
                    return cell === "" || cell === "null" ? null : cell;
                }));
                break;
            default: // other lines are ignored
                break;
        }
    }).on('close', function () {
        cb(file, table, formats, columns, records);
    })
}


function performDataCalculation(client) {
    return Promise.resolve()
        .then(() => {
            return client.query("DELETE FROM data.travel_times;")
        })
        .then(() => {
            return client.query(`SELECT data.data_fill_travel_times();`)
        })
        .then(() => {
            return client.query(`DELETE FROM data.frt_ort_last;`)
        })

        .then(() => {
            return client.query(`
                            INSERT INTO data.frt_ort_last (trip, onr_typ_nr, ort_nr)
                                (
                                SELECT DISTINCT ON (trip) trip, onr_typ_nr, ort_nr
                                FROM data.rec_frt
                                LEFT JOIN data.lid_verlauf
                                    ON rec_frt.line=lid_verlauf.line
                                    AND rec_frt.variant=lid_verlauf.variant
                                ORDER BY trip, li_lfd_nr DESC
                                );
                        `);
        })
        .then(() => {
            return client.query(`
                        UPDATE data.rec_ort
                            SET the_geom =
                                ST_Transform(
                                    ST_SetSRID(
                                        ST_MakePoint(
                                            data.data_bigint_2_degree(ort_pos_laenge),
                                            data.data_bigint_2_degree(ort_pos_breite)
                                        ), ${VDV_COORDINATES_FORMAT}
                                    ), ${DB_COORDINATES_FORMAT}
                                );
                        `);
        })
        .then(() => {
            return client.query(`
                            UPDATE data.lid_verlauf
                            SET the_geom=ort_edges.the_geom
                            FROM data.lid_verlauf verlauf_next, data.ort_edges
                                WHERE lid_verlauf.line=verlauf_next.line
                                    AND lid_verlauf.variant=verlauf_next.variant
                                    AND lid_verlauf.li_lfd_nr+1=verlauf_next.li_lfd_nr
                                    AND lid_verlauf.ort_nr=ort_edges.start_ort_nr
                                    AND lid_verlauf.onr_typ_nr=ort_edges.start_onr_typ_nr
                                    AND verlauf_next.ort_nr=ort_edges.end_ort_nr
                                    AND verlauf_next.onr_typ_nr=ort_edges.end_onr_typ_nr;
                        `);
        })
        .then(() => {
            return client.query(`
                            UPDATE data.lid_verlauf
                            SET the_geom =
                                (
                                SELECT
                                ST_Force2D(ST_MakeLine(rec_ort_start.the_geom, rec_ort_end.the_geom))
                                FROM data.rec_lid
                                INNER JOIN data.lid_verlauf lid_verlauf_start
                                    ON lid_verlauf_start.line=rec_lid.line
                                    AND lid_verlauf_start.variant=rec_lid.variant
                                INNER JOIN data.lid_verlauf lid_verlauf_end
                                    ON lid_verlauf_start.line=lid_verlauf_end.line
                                    AND lid_verlauf_start.variant=lid_verlauf_end.variant
                                    AND lid_verlauf_start.li_lfd_nr + 1 = lid_verlauf_end.li_lfd_nr
                                INNER JOIN data.rec_ort rec_ort_start
                                    ON lid_verlauf_start.onr_typ_nr =  rec_ort_start.onr_typ_nr
                                    AND lid_verlauf_start.ort_nr = rec_ort_start.ort_nr
                                INNER JOIN data.rec_ort rec_ort_end
                                    ON lid_verlauf_end.onr_typ_nr =  rec_ort_end.onr_typ_nr
                                    AND lid_verlauf_end.ort_nr = rec_ort_end.ort_nr
                                WHERE lid_verlauf.line=lid_verlauf_start.line
                                    AND lid_verlauf.variant=lid_verlauf_start.variant
                                    AND lid_verlauf.li_lfd_nr=lid_verlauf_start.li_lfd_nr
                                )
                            WHERE lid_verlauf.the_geom IS NULL;
                        `)
        })
        .then(() => {
            return client.query(`
                            UPDATE data.rec_lid
                            SET the_geom =
                                (SELECT
                                ST_MakeLine(ST_Force2D(rec_ort.the_geom) ORDER BY li_lfd_nr)
                                FROM data.lid_verlauf
                                INNER JOIN data.rec_ort ON lid_verlauf.ort_nr=rec_ort.ort_nr
                                    AND lid_verlauf.onr_typ_nr=rec_ort.onr_typ_nr
                                WHERE lid_verlauf.line=rec_lid.line
                                    AND lid_verlauf.variant=rec_lid.variant
                                );
                        `)
        })

        .then(() => {
            return generateZipForApp(client)
        })
}

// </editor-fold>

// ============================================== APP ZIP GENERATION ===================================================

// <editor-fold desc="APP ZIP GENERATION">

function generateZipForApp(client) {
    logger.warn("Generating planned data zip for app");

    let mainFile = {};

    return Promise.resolve()
        .then(() => {
            if (fs.existsSync(VDV_APP_ROOT)) {
                let files = fs.readdirSync(VDV_APP_ROOT);

                for (let file of files) {
                    logger.debug(`Deleting file '${file}'`);
                    fs.unlinkSync(path.join(VDV_APP_ROOT, file));
                }
            } else {
                logger.info(`Creating directory '${VDV_APP_ROOT}'`);
                fs.mkdirSync(VDV_APP_ROOT);
            }
        })

        .then(() => {
            return getTrips(client)
        })
        .then(result => {
            let lines = {};

            for (let entry of result.rows) {
                // noinspection EqualityComparisonWithCoercionJS
                if (lines[entry.day_type] == null) {
                    lines[entry.day_type] = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (lines[entry.day_type][entry.line] == null) {
                    lines[entry.day_type][entry.line] = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (lines[entry.day_type][entry.line].variants == null) {
                    lines[entry.day_type][entry.line].variants = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (lines[entry.day_type][entry.line].variants[entry.variant] == null) {
                    lines[entry.day_type][entry.line].variants[entry.variant] = {};
                }


                // noinspection EqualityComparisonWithCoercionJS
                if (lines[entry.day_type][entry.line].variants[entry.variant].trips == null) {
                    lines[entry.day_type][entry.line].variants[entry.variant].trips = [];
                }

                lines[entry.day_type][entry.line].line = entry.line;
                lines[entry.day_type][entry.line].variants[entry.variant].variant = entry.variant;

                lines[entry.day_type][entry.line].variants[entry.variant].trips.push({
                    d: entry.departure,
                    tg: entry.trip_time_group,
                    t: entry.trip
                });
            }

            Object.keys(lines).forEach(function (el1, key, array) {
                Object.keys(lines[el1]).forEach(function (el2, key, array) {
                    lines[el1][el2].variants = Object.keys(lines[el1][el2].variants)
                        .map(p => lines[el1][el2].variants[p]);
                });

                lines[el1] = Object.keys(lines[el1])
                    .map(p => lines[el1][p]);
            });

            return lines;
        })

        .then(lines => {
            Object.keys(lines).forEach(function (element, key, array) {
                let file = `${VDV_APP_ROOT}/trips_${element}.json`;
                logger.info(`Writing file '${file}'`);
                fs.writeFileSync(file, JSON.stringify(lines[element]));
            });

            return null
        })

        .then(() => {
            return getCalendar(client)
        })
        .then(result => {
            let calendar = [];

            for (let entry of result.rows) {
                calendar.push({
                    dt: entry.day_type,
                    da: entry.betriebstag,
                });
            }

            mainFile.calendar = calendar;

            return null
        })

        .then(() => {
            return getBusStopStopTimes(client)
        })
        .then(result => {
            let busStopStopTimes = [];

            for (let entry of result.rows) {
                busStopStopTimes.push({
                    bs: entry.ort_nr,
                    st: entry.hp_hzt,
                    tg: entry.trip_time_group,
                });
            }

            mainFile.bus_stop_stop_times = busStopStopTimes;

            return null
        })

        .then(() => {
            return getTravelTimes(client)
        })
        .then(result => {
            let travelTimes = [];

            for (let entry of result.rows) {
                travelTimes.push({
                    di: entry.sel_ziel,
                    oi: entry.ort_nr,
                    tg: entry.trip_time_group,
                    tt: entry.sel_fzt,
                });
            }

            mainFile.travel_times = travelTimes;

            return null
        })

        .then(() => {
            return getTripStopTimes(client)
        })
        .then(result => {
            let tripStopTimes = [];

            for (let entry of result.rows) {
                tripStopTimes.push({
                    bs: entry.ort_nr,
                    st: entry.frt_hzt_zeit,
                    tr: entry.trip,
                });
            }

            mainFile.trip_stop_times = tripStopTimes;

            return null
        })

        .then(() => {
            return getLinePath(client)
        })
        .then(result => {
            let linePath = {};

            for (let entry of result.rows) {
                // noinspection EqualityComparisonWithCoercionJS
                if (linePath[entry.line] == null) {
                    linePath[entry.line] = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (linePath[entry.line].variants == null) {
                    linePath[entry.line].variants = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (linePath[entry.line].variants[entry.variant] == null) {
                    linePath[entry.line].variants[entry.variant] = {};
                }

                // noinspection EqualityComparisonWithCoercionJS
                if (linePath[entry.line].variants[entry.variant].path == null) {
                    linePath[entry.line].variants[entry.variant].path = [];
                }

                linePath[entry.line].line = entry.line;
                linePath[entry.line].variants[entry.variant].variant = entry.variant;

                linePath[entry.line].variants[entry.variant].path.push(entry.ort_nr);
            }

            Object.keys(linePath).forEach(function (el2, key, array) {
                linePath[el2].variants = Object.keys(linePath[el2].variants)
                    .map(p => linePath[el2].variants[p]);
            });

            linePath = Object.keys(linePath)
                .map(p => linePath[p]);

            mainFile.paths = linePath;

            return null
        })

        .then(() => {
            let file = `${VDV_APP_ROOT}/planned_data.json`;
            logger.info(`Writing file '${file}'`);
            fs.writeFileSync(file, JSON.stringify(mainFile));

            if (fs.existsSync(`${VDV_APP_ROOT}/${APP_ZIP_FILE}`)) {
                logger.info(`Deleting old zip '${APP_ZIP_FILE}'`);
                fs.unlinkSync(`${VDV_APP_ROOT}/${APP_ZIP_FILE}`);
            }

            logger.info(`Compressing files as '${APP_ZIP_FILE}'`);

            const command = `zip -j -D ${APP_ZIP_FILE} ${VDV_APP_ROOT}/*.json`;
            const zip = spawn('/bin/sh', ['-c', command]);

            console.log(`Zip: stdout: ${zip.stdout.toString()}`);

            if (zip.status !== 0) {
                throw new HttpError(`Zip exited with status code '${zip.status}', stderr=${zip.stderr.toString()}`, 500)
            }

            logger.info("File compression successful");

            return null
        })

}

function getTrips(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    day_type,
                    trip,
                    departure,
                    trip_time_group,
                    line,
                    variant
                    
                FROM data.rec_frt
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

function getCalendar(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    day_type,
                    betriebstag
                    
                FROM data.firmenkalender
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

function getBusStopStopTimes(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    trip_time_group,
                    ort_nr,
                    hp_hzt
                    
                FROM data.ort_hztf
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

function getTravelTimes(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    sel_ziel,
                    ort_nr,
                    trip_time_group,
                    sel_fzt
                    
                FROM data.sel_fzt_feld
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

function getTripStopTimes(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    ort_nr,
                    frt_hzt_zeit,
                    trip
                    
                FROM data.rec_frt_hzt
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

function getLinePath(client) {
    return Promise.resolve()
        .then(() => {
            return `
                SELECT
                    ort_nr,
                    li_lfd_nr,
                    line,
                    variant
                    
                FROM data.lid_verlauf
                ORDER BY line, li_lfd_nr
            `
        })
        .then(sql => {
            return client.query(sql)
        })
}

// </editor-fold>

// ===================================================== MAIL ==========================================================

// <editor-fold desc="MAIL">

function sendSuccessMail(json) {
    return new Promise(function (resolve, reject) {
        logger.info("Sending success mail");

        let options = {
            host: 'mail-pool.appspot.com',
            port: 80,
            path: '/sasa/vdv/import/success',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        let req = http.request(options, function (res) {
            logger.info('Mail status: ' + res.statusCode);

            let body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });

            res.on('end', function () {
                console.log("Mail response: " + body);

                resolve();
            });
        });

        req.on('error', function (e) {
            console.log("Mail error: " + e.message);

            reject(e);
        });

        req.write(JSON.stringify(json));
        req.end();
    });
}

function sendFailureMail(error) {
    return new Promise(function (resolve, reject) {
        logger.info("Sending failure mail");

        let options = {
            host: 'mail-pool.appspot.com',
            port: 80,
            path: '/sasa/vdv/import/failure',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        let req = http.request(options, function (res) {
            logger.info('Mail status: ' + res.statusCode);

            res.setEncoding('utf8');

            let body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });

            res.on('end', function () {
                logger.info("Mail response: " + body);

                resolve();
            });
        });

        req.on('error', function (e) {
            logger.error('Mail error: ' + e.message);

            reject(e);
        });

        req.write(JSON.stringify(error));
        req.end();
    });
}

// </editor-fold>