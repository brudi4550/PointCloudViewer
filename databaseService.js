const mysql = require('mysql');
const dotenv = require('dotenv').config();
const crypto = require('crypto');

async function publicClouds(callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query('SELECT cloud_name, link, public FROM cloud_table WHERE public = TRUE;', function (error, result, fields) {
            callback(error, result, false)
        });
        connection.end()
    });
}

async function privateClouds(username, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query('SELECT cloud_name, link, public FROM cloud_table WHERE (public = FALSE and created_by = ?) or public = true;',
            [
                username
            ],
            function (error, result, fields) {
                callback(error, result, true)
            });
        connection.end();
    });
}

async function checkSession(username, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query('SELECT expiration from session_table where user_name = ?;',
            [
                username
            ],
            function (error, result, fields) {
                callback(error, result)
            });
        connection.end();
    });
}

async function login(username, password, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("SELECT salt, password_hash FROM user_table WHERE user_name = ?;",
            [
                username
            ],
            function (error, result, fields) {
                if (error || !result || result.length == 0) {
                    callback(false);
                } else {
                    var passwordHash = crypto.pbkdf2Sync(password, result[0].salt, 1000, 64, `sha512`).toString(`hex`);
                    callback(passwordHash === result[0].password_hash);
                }
            });
        connection.end()
    }); //TODO check when to close the db connection
}

function setNewSession(username, expiration, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("insert into session_table (user_name, expiration) values (?, ?) on duplicate key update expiration = ?;",
            [
                username,
                expiration,
                expiration
            ],
            function (error, result, fields) {
                callback(error, result);
            });
        connection.end();
    });
}

function createNewUser(username, password, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        var salt = crypto.randomBytes(16).toString('hex');
        var hash = crypto.pbkdf2Sync(password, salt,
            1000, 64, `sha512`).toString(`hex`);
        connection.query('USE pointcloudDB;');
        connection.query("insert into user_table (user_name, password_hash, salt) values (?, ?, ?);",
            [
                username,
                hash,
                salt
            ],
            function (error, result, fields) {
                callback(error, result);
            });
        connection.end();
    });
}

function authenticateUser(username, password, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("SELECT salt, password_hash FROM user_table WHERE user_name = ?;",
            [
                username
            ],
            function (error, result, fields) {
                if (error || !result || result.length == 0) {
                    callback(false);
                } else {
                    var passwordHash = crypto.pbkdf2Sync(password, result[0].salt, 1000, 64, `sha512`).toString(`hex`);
                    callback(passwordHash === result[0].password_hash);
                }
            });
        connection.end()
    });
}

//function assumes user has already been authenticated
function authenticateAction(username, pointcloudName, callback) {
    var connection = mysql.createConnection({
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
    });

    connection.connect(function (err) {
        if (err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query('SELECT cloud_name, user_name FROM cloud_table INNER JOIN user_table ON' +
            + 'cloud_table.created_by = user_table.user_name'
            + 'WHERE user_table.user_name = ?'
            + 'AND cloud_table.cloud_name = ?',
            [
                username,
                pointcloudName
            ],
            function (error, result, fields) {
                return callback(error || !result || result.length == 0);
            });
        connection.end()
    });
}

// TODO write function to store new pointcloud
module.exports = {
    publicClouds,
    privateClouds,
    login,
    checkSession,
    setNewSession,
    createNewUser,
    authenticateUser,
    authenticateAction
};