'use strict';

const database = require("../../../database/database");
const utils = require("../../../util/utils");

const moment = require("moment");
const bcrypt = require("bcrypt");

const LoginError = require("../../../util/LoginError");

module.exports.register = function (req, res) {
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
                utils.isEmpty(req.query.username) ||
                utils.isEmpty(req.query.password) ||
                utils.isEmpty(req.query.birthdate) ||
                utils.isEmpty(req.query.male)) {

                throw LoginError("invalid_or_missing_parameters")
            }
        })

}

function checkForCorrectUsername(req) {
    return Promise.resolve()
        .then(() => {
            let username = req.query.username;

            if (username.length < 6) {
                throw LoginError("username_too_short", {
                    it: "Il nome dell'utente deve essere lungo almeno 6 caratteri.",
                    de: "Der Benutzername muss mindestens 6 Charakter lang sein.",
                    en: "The user name must be at least 6 characters long."
                }, "username")
            }

            if (username.length > 24) {
                throw LoginError("username_too_long", {
                    it: "Il nome dell'utente deve essere lungo al massimo 24 caratteri.",
                    de: "Der Benutzername darf maximal 24 Charakter lang sein.",
                    en: "The user name must not be longer than 24 characters."
                }, "username")
            }

            let regex = /[\w ]+/;
            if (!regex.test(username)) {
                throw LoginError("invalid_username", {
                    it: "Solo lettere, numeri, spazi, e trattini bassi sono permessi.",
                    de: "Nur Buchstaben, Zahlen, Leerzeichen und Unterstriche sind erlaubt.",
                    en: "Only letters, spaces, numbers and underscores are allowed."
                }, "username")
            }

            regex = /^[a-zA-Z]+$/;
            if (!regex.test(username.charAt(0))) {
                throw LoginError("invalid_username", {
                    it: "Il username deve iniziare con una lettera.",
                    de: "Das erste Zeichen muss ein Buchstabe sein.",
                    en: "The first character needs to be a letter."
                }, "username")
            }

            if (username.endsWith(' ')) {
                throw LoginError("invalid_username", {
                    it: "Il username non deve terminare con uno spazio.",
                    de: "Das letzte Zeichen darf kein Leerzeichen sein.",
                    en: "The last character must not be a space."
                }, "username")
            }
        })
}

function checkForCorrectPassword(req) {
    return Promise.resolve()
        .then(() => {
            let password = req.query.password;

            if (password.length < 6) {
                throw LoginError("password_too_short", {
                    it: "La password deve essere lunga almeno 6 caratteri.",
                    de: "Das Passwort muss mindestens 6 Charakter lang sein.",
                    en: "The password must be at least 6 characters long."
                }, "password")
            }
        })
}

function checkForCorrectEmail(req) {
    return Promise.resolve()
        .then(() => {
            let email = req.query.email;

            let regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

            if (!regex.test(email)) {
                throw LoginError("invalid_email", {
                    it: "L'indirizzo e-mail è invalido.",
                    de: "Die E-Mail-Adresse ist ungültig.",
                    en: "The email is invalid."
                }, "email")
            }

            // TODO: Perform banned domains check
            /*$banned_domains = file('https://gist.githubusercontent.com/adamloving/4401361/raw/db901ef28d20af8aa91bf5082f5197d27926dea4/temporary-email-address-domains', FILE_IGNORE_NEW_LINES);

            if (in_array(explode('@', $request->getParam('email'), 2)[1], $banned_domains)) {
                return $response->withJson([
                    'success' => false,
                    'error' => 'invalid_email',
                    'error_message' => [
                    'it' => 'Questo indirizzo e-mail è invalido.',
                    'de' => 'Diese E-Mail-Adresse ist ungültig.',
                    'en' => 'This email is invalid.'
            ][$lang],
                    'param' => 'email'
            ]);
            }*/
        })
}

function checkForCorrectAge(req) {
    return Promise.resolve()
        .then(() => {
            let birthDate = moment(req.query.birthdate);

            let now = moment().tz("Europe/Rome");

            let duration = moment.duration(now.diff(birthDate));
            let age = duration.asYears();

            if (age < 0) {
                throw LoginError("user_not_alive", {
                    it: "La data di nascità è nel futuro.",
                    de: "Das Geburtsdatum ist in der Zukunft.",
                    en: "The birthdate is in the future."
                }, "birthdate")
            }

            if (age > 120) {
                throw LoginError("user_not_alive", {
                    it: "La età massima è 120 anni.",
                    de: "Das höchste Alter beträgt 120 Jahre.",
                    en: "The maximum age is 120 years."
                }, "birthdate")
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

function checkIfEmailAlreadyExists(req, client) {
    let email = req.query.email;

    return Promise.resolve(`SELECT COUNT(*) FROM eco_points.users WHERE email = '${email}'`)
        .then(sql => {
            return client.query(sql)
        })
        .then(result => {
            if (result.rowCount > 0) {
                throw LoginError("email_already_exists", {
                    it: "Questa e-mail è già in uso. Per favore scegli un'alra",
                    de: "Diese E-Mail wird bereits benutzt. Bitte wähle eine andere.",
                    en: "This email has already been used. Please choose another one."
                }, null)
            }
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
            // TODO: Create profile picture dir, send registration email, add FCM token, add email verification hash
            return true
        })
}