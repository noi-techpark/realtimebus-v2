'use strict';

const database = require("../../../database/database");
const utils = require("../../../util/utils");

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
                    return checkForCorrectUsername(req)
                })
                .then(() => {
                    return checkForCorrectPassword(req)
                })
                .then(() => {
                    return checkForCorrectEmail(req)
                })
                .then(() => {
                    return checkForCorrectAge(req)
                })
                .then(() => {
                    return checkForRequiredHeaders(req)
                })
                .then(() => {
                    return checkIfEmailAlreadyExists(req, client)
                })
                .then(() => {
                    return checkIfUserAlreadyExists(req, client)
                })
                .then(() => {
                    return insert(req, client)
                })
                .then(() => {
                    res.status(200).jsonp({success: true});
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

function checkIfEmailIsValid(req, client) {
    let email = req.query.email;

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

            return result
        })
}

function checkIfUserAlreadyExists(req, client) {
    let userName = req.query.username;

    return Promise.resolve(`SELECT COUNT(*) FROM eco_points.users WHERE username = '${userName}'`)
        .then(sql => {
            return client.query(sql)
        })
        .then(result => {
            if (result.rowCount > 0) {
                throw LoginError("username_already_exists", {
                    it: "Questo username è già in uso. Per favore scegli un'alra",
                    de: "Dieser Benutzername wird bereits benutzt. Bitte wähle einen anderen.",
                    en: "This username has already been used. Please choose another one."
                }, null)
            }
        })
}

function insert(req, client) {
    let id;

    return Promise.resolve()
        .then(() => {
            let birthDate = moment(req.query.birthdate);

            let hashedPassword = bcrypt.hashSync(req.query.password);
            let emailVerificationHash = utils.randomHex(16);

            let profile = utils.random(0, Number.MAX_SAFE_INTEGER);
            id = utils.generateProfileId();

            let gender = req.query.male ? 1 : 2;

            return `INSERT INTO eco_points.users 
                       VALUES (id, profile, email, username, password, gender, birth_date)
                       (
                        '${id}', 
                        ${profile},
                        '${req.query.email}', 
                        '${req.query.username}', 
                        '${hashedPassword}', 
                        ${gender},
                        '${birthDate}',
                        )`;
        })
        .then(sql => {
            return client.query(sql)
        })
        .then(() => {
            return `
                INSERT INTO eco_points.users_login
                VALUES (id, device_android_id, device_serial, device_model, ip, locale)
                (
                '${id}',
                '${req.get("X-Android-Id")}',
                '${req.get("X-Serial")}',
                '${req.get("X-Device")}',
                '${req.get("X-IP")}',
                '${req.get("X-Language")}',
                )
            `
        })
        .then(sql => {
            return client.query(sql)
        })
        .then(() => {
            return `
                INSERT INTO eco_points.password_reset VALUES (id, secret)
                ('${id}', ${utils.random(0, Number.MAX_SAFE_INTEGER)})
            `
        })
        .then(sql => {
            return client.query(sql)
        })
        .then(() => {
            // TODO: Create profile picture dir, send registration email, add FCM token
            return true
        })
}


$last_login = new DateTime;
$last_login->setTimestamp(time());

Utils::addFcmToken($user->id, $request->getParam('fcm_token'));

$user->language = Utils::getLanguage($request);
$user->last_login = $last_login;
$user->ip_last_login = Utils::getIp($request);
$user->device_last_login = Headers::getDevice($request);
$user->version_code = Headers::getVersionCode($request);
$user->version_name = Headers::getVersionName($request);
$user->android_id_ll = Headers::getDeviceId($request);
$user->serial_ll = Headers::getSerial($request);

$store->upsert($user);

return $response->withJson([
    'success'
=>
true,
    'access_token'
=>
Utils::genAccessToken($user)
])
;