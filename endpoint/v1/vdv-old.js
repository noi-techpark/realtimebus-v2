'use strict';

const AdmZip = require("adm-zip");
const connection = require("../../database/connection.js");
const fs = require("fs");
const logger = require("../../util/logger");
const reader = require("readline");

const latestVdvZip = 'vdv/latest.zip';
const latestExtractedVdvData = 'vdv/latest';
const vdvFiles = latestExtractedVdvData + '/vdv';

// SELECT 'DROP TABLE ' || tablename || ';' FROM pg_tables WHERE tablename LIKE 'vdv_%' AND schemaname = 'public';

module.exports = {

    upload: function (req) {
        return new Promise(function (resolve, reject) {
            fs.writeFile(latestVdvZip, req.body, function (err) {
                if (err) {
                    return reject(err);
                }

                logger.debug("Saved zip file containing VDV data");

                new AdmZip(latestVdvZip).extractAllTo(latestExtractedVdvData, true);
                logger.debug("Extracted latest VDV data");

                fs.writeFile('vdv/' + new Date().toISOString() + '.zip', req.body, function (err) {
                    if (err) {
                        return reject(err);
                    }

                    logger.debug("Archived zip file containing VDV data");

                    fs.readdir(vdvFiles, (err, files) => {
                        files.forEach(file => {
                            logger.debug(file);

                            // Filter out VDV files (their names end in .X10)
                            if (file.split(".").pop() === "X10") {
                                var table = "";
                                var columns = "";
                                var records = "";

                                reader.createInterface({
                                    input: fs.createReadStream(vdvFiles + '/' + file)
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
                                            records += '(' + csv.map(function (value) {
                                                    return String(value).trim();
                                                }).join() + '),';
                                            break;
                                        case "eof": // end of file
                                            if (table !== "" && columns.length !== 0 && records !== "") {
                                                let create = "CREATE TABLE VDV_" + table + "(";

                                                columns.forEach(function (col) {
                                                    create += col.trim() + " text,";
                                                });

                                                create = create.slice(0, -1) + ");";

                                                connection.query(create);

                                                let insert = "INSERT INTO VDV_" + table + " VALUES " + records;

                                                insert = insert.slice(0, -1) + ";";

                                                connection.query(insert);
                                            }

                                            break;
                                        default: // other lines are ignored
                                            break;
                                    }
                                });
                            }
                        });

                        logger.info(`Found ${files.length} files`);
                    });

                    resolve()
                })
            })
        });
    }
};