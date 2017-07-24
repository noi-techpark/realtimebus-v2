'use strict';

const database = require("../../../database/database");
const utils = require("../../../util/utils");
const headers = require("../../../util/headers");

const moment = require("moment");
const bcrypt = require("bcrypt");

const LoginError = require("../../../util/LoginError");


module.exports.login = function (req, res) {
    database.connect()
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    return checkForMissingParams(req)
                })
                .then(() => {
                    return checkForRequiredHeaders(req)
                })
                .then(() => {
                    return checkIfUserIsValid(req)
                })
                .then(token => {
                    res.status(200).jsonp({success: true, access_token: token});
                    client.release();
                })
                .catch(error => {
                    logger.error(error);
                    utils.respondWithError(res, error);
                    client.release();
                })
        })
        .catch(error => {
            logger.error(`Error acquiring client: ${error}`);
            utils.respondWithError(res, error);
        })
};


function checkForMissingParams(req) {
    return Promise.resolve()
        .then(() => {
            if (utils.isEmpty(req.query.email) ||
                utils.isEmpty(req.query.password) ||
                utils.isEmpty(req.query.password)) {
                throw LoginError("invalid_or_missing_parameters")
            }
        })

}

function checkForRequiredHeaders(req) {
    return Promise.resolve()
        .then(() => {
            let requiredHeaders = ['X-Device', 'X-Language', 'X-Serial', 'X-Version-Code', 'X-Version-Name'];

            for (let header of requiredHeaders) {
                let h = req.get(header);

                // noinspection EqualityComparisonWithCoercionJS
                if (h == null) {
                    throw LoginError("missing_header", {
                        it: `Il header ${header} manca.`,
                        de: `Der Header ${header} fehlt.`,
                        en: `The header ${header} is missing.`
                    }, null)
                }
            }
        })
}

function checkIfUserIsValid(req, client) {
    let email = req.query.email;
    let user;

    return Promise.resolve(`
        SELECT 
            id,
            password,
            email_verification.verified
        FROM eco_points.users 
        
        INNER JOIN eco_points.email_verification
            ON users.id = email_verification.id
        
        WHERE email = '${req.query.email}'
        `)
        .then(sql => {
            return client.query(sql)
        })
        .then(result => {
            if (result.rowCount === 0) {
                throw LoginError("wrong_email", {
                    it: "Questo utente non esiste.",
                    de: "Diesen Benutzer gibt es nicht.",
                    en: "This user does not exist."
                }, "email")
            }

            if (!bcrypt.compareSync(req.query.password, result.rows[0].password)) {
                throw LoginError("wrong_password", {
                    it: "La password è sbagliata.",
                    de: "Das Passwort ist falsch.",
                    en: "The password is wrong."
                }, "password");
            }

            if (result.rowCount === 0 || !result.rows[0].verified) {
                throw LoginError("email_not_verified", {
                    it: "Non hai ancora verificato la tua e-mail.",
                    de: "Du hast deine E-Mail noch nicht bestätigt.",
                    en: "You haven't confirmed your email yet."
                }, "email")
            }

            user = result.rows[0];

            let androidId = headers.getDeviceId(req);
            let versionCode = headers.getVersionCode(req);
            let versionName = headers.getVersionName(req);
            let serial = headers.getSerial(req);
            let device = headers.getDevice(req);
            let ip = headers.getIp(req);
            let language = headers.getLanguage(req);

            return `
                INSERT INTO eco_points.users_login (id, device_android_id, device_serial, device_model, ip, version_code, version_name, locale)
                VALUES(
                    '${user.id}', 
                    '${androidId}', 
                    '${serial}',
                    '${device}',
                    '${ip}',
                    ${versionCode},
                    '${versionName}',
                    '${language}
                )`
        })
        .then(sql => {
            return client.query(sql)
        })
        .then(() => {
            return utils.generateEcoPointsJwt(user);
        })
}