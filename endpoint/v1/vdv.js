'use strict';

const AdmZip = require("adm-zip");
const connection = require("../../database/database.js");
const fs = require("fs");
const logger = require("../../util/logger");
const reader = require("readline");

const HttpError = require("../../util/utils");

const LATEST_VDV_ZIP = 'vdv/latest.zip';
const LATEST_EXTRACTED_VDV_DATA = 'vdv/latest';
const VDV_FILES = LATEST_EXTRACTED_VDV_DATA + '/vdv';

// SELECT 'DROP TABLE ' || tablename || ';' FROM pg_tables WHERE tablename LIKE 'vdv_%' AND schemaname = 'public';

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
const TRIP_STOP_TIMES = "REC_FRT_HZT.X10";
const BUS_STOP_STOP_TIMES = "ORT_HZTF.X10";
const TRIP_INFO_EXTENDED = "REC_FRT.X10";
const STOP_POINTS = "REC_HP.X10";
const LINES = "REC_LID.X10";
const VARIANTS = "REC_LIVAR_FGR.X10";
const BUS_STOPS = "REC_ORT.X10";
const BUS_STOP_CONNECTIONS = "REC_SEL.X10";
const TRAVEL_TIMES = "SEL_FZT_FELD.X10";
const TEQ_MAPPING = "teqnummern.csv";
const SERVICE_PROVIDERS = "ZUL_VERKEHRSBETRIEB.X10";

const vdvFileList = [VALIDITY, CALENDAR, PATHS, AREAS, TRIP_TYPES, TRIP_PEEK_TIMES, VEHICLE_TYPES, LINE_SERVICES,
    STOP_TYPES, BUS_STOP_TYPES, DAY_TYPES, COMPANIES, BREAKS, TRIP_INFO_REDUCED, TRIP_STOP_TIMES, BUS_STOP_STOP_TIMES,
    TRIP_INFO_EXTENDED, LINES, VARIANTS, BUS_STOPS, BUS_STOP_CONNECTIONS, SERVICE_PROVIDERS];

module.exports = {

    upload: function (req, res) {
        return new Promise(function (resolve, reject) {
            fs.writeFile(LATEST_VDV_ZIP, req.body, function (err) {
                if (err) {
                    return reject(err);
                }

                logger.debug("Saved zip file containing VDV data");

                new AdmZip(LATEST_VDV_ZIP).extractAllTo(LATEST_EXTRACTED_VDV_DATA, true);
                logger.debug("Extracted latest VDV data");

                resolve()
            })
        }).then(() => {
            return new Promise(function (resolve, reject) {
                fs.writeFile('vdv/' + new Date().toISOString() + '.zip', req.body, function (err) {
                    if (err) {
                        return reject(err);
                    }

                    logger.debug("Archived zip file containing VDV data");

                    resolve()
                })
            })
        }).then(() => {
            return new Promise(function (resolve, reject) {
                fs.readdir(VDV_FILES, (err, files) => {
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
                                parseVdvFile(VDV_FILES + '/' + file, function (table, columns, records) {
                                    if (records.length === 0) {
                                        return reject(new HttpError(`Table ${table} does not contain any records. VDV import was aborted. No changes have been applied to the current data.`, 400));
                                    }

                                    resolve();
                                })
                            })
                        });
                    });

                    logger.debug(`Successfully validated ${vdvFileList.length} VDV files`);

                    chain = chain.then(() => {
                        resolve()
                    }).catch(error => {
                        reject(error)
                    })
                })
            })
        }).then(() => {
            res.status(200).json({success: true})
        }).catch(err => {
            logger.error(err);
            res.status(err.status).json({success: false, error: err})
        });
    }
};

function parseVdvFile(file, cb) {
    let table = null;
    let columns = [];
    let records = [];

    reader.createInterface({
        input: fs.createReadStream(file)
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
                records.push(csv);
                break;
            default: // other lines are ignored
                break;
        }
    }).on('close', function () {
        cb(table, columns, records);
    })
}