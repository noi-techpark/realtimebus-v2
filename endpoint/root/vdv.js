'use strict';

require("moment");

const AdmZip = require("adm-zip");
const fs = require("fs");
const http = require("http");
const moment = require("moment-timezone");
const reader = require("readline");

const VdvFile = require("../../model/vdv/VdvFile");
const HttpError = require("../../util/HttpError");

const logger = require("../../util/logger");
const config = require("../../config");
const database = require("../../database/database.js");
const Utils = require("../../util/utils");

const LATEST_VDV_ZIP = 'vdv/latest.zip';
const LATEST_EXTRACTED_VDV_DATA = 'vdv/latest';
const VDV_FILES = LATEST_EXTRACTED_VDV_DATA + '/vdv';

// import vdv data
// curl --header "Content-Type:application/octet-stream" --data-binary @/path/to/vdv.zip http://HOST/vdv

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

const vdvFileList = [VALIDITY, DAY_TYPES, CALENDAR, LINES, BUS_STOPS, PATHS, TRIP_TYPES, TRIP_PEEK_TIMES, LINE_SERVICES,
    STOP_TYPES, BUS_STOP_TYPES, COMPANIES, BREAKS, TRIP_INFO_REDUCED, TRIP_INFO_EXTENDED, BUS_STOP_STOP_TIMES,
    STOP_POINTS, VARIANTS, BUS_STOP_CONNECTIONS, TRAVEL_TIMES];

let response = {};
let sqlTruncateChain = [];
let sqlCreateChain = [];
let sqlInsertChain = [];
let sqlTeqChain = [];

module.exports.upload = function (req, res) {
    let data = [];

    config.vdv_import_running = true;

    return database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    return saveZipFiles(req)
                })
                .then(() => {
                    return parseVdvFiles(data)
                })
                .then(() => {
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

                                    logger.info(`Calendar contains ${file.rows.length} days.`);

                                    if (response.data_valid_from !== response.calendar_days_first) {
                                        logger.warn("Validity begin of uploaded data and first day in calendar do not match. Did you mess up the previous upload?");
                                    }

                                    if (response.calendar_days_first === response.calendar_days_last) {
                                        logger.warn("The first day in the calendar is equal to the last one. Are you sure you uploaded the correct calendar data?");
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
                                                sql2 += `null, `;
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
                    return calculateTravelTimes(client)
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
                    return new Promise(function (resolve) {
                        http.get({
                            host: 'mail-pool.appspot.com',
                            port: 80,
                            path: '/sasa/vdv/import/success'
                        });

                        resolve()
                    });
                })
                .then(() => {
                    logger.warn("Import finished");

                    config.vdv_import_running = false;

                    response.success = true;
                    res.status(200).json(Utils.sortObject(response))
                })
                .catch(err => {
                    logger.error("Import failed!");
                    logger.error(err);

                    config.vdv_import_running = false;

                    let status = err.status || 500;

                    res.status(status).json({success: false, error: err})
                });
        })
        .catch(error => {
            config.vdv_import_running = false;

            logger.error(`Error acquiring client: ${error}`);
            res.status(500).jsonp({success: false, error: error})
        })
};


function saveZipFiles(req) {
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
                            parseVdvFile(file, data, function (fileName, table, formats, columns, rows, data) {
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
        }).then(() => {
            return client.query(`INSERT INTO data.rec_lid (version, line, variant, line_name)
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
    return Promise.resolve()
        .then(() => {
            return new Promise(function (resolve) {
                let firstLine = true;

                reader.createInterface({
                    input: fs.createReadStream(VDV_FILES + '/' + TEQ_MAPPING)
                }).on('line', function (line) {
                    if (!firstLine) {
                        let numbers = line.split("\t");
                        sqlTeqChain.push(`UPDATE data.rec_frt SET teq = ${numbers[1]} WHERE trip = ${numbers[0]}`);
                    }

                    firstLine = false;
                }).on('close', function () {
                    resolve()
                });
            })
        })
        .then(() => {
            let chain = Promise.resolve();

            for (let sql of sqlTeqChain) {
                chain = chain.then(() => {
                    return client.query(sql)
                })
            }

            return chain
        })
}

function calculateTravelTimes(client) {
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
            return client.query(`INSERT INTO data.config VALUES('data_valid_from', '${response.data_valid_from}')`)
        })
}

function parseVdvFile(file, data, cb) {
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
        cb(file, table, formats, columns, records, data);
    })
}