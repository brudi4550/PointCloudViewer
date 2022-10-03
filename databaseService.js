const mysql = require('mysql');
const dotenv = require('dotenv').config();
const crypto = require('crypto');
const { query } = require('express');
const util = require( 'util' );

const STANDARD_SCHEMA = "pointcloudDB2";

const UPLOAD_STATUS_ENUM = {
    UNDEFINED: 'UNDEFINED',
    INITIALIZED: 'INITIALIZED',
    COMPLETE_ORDER_SENT: 'COMPLETE_ORDER_SENT',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    ON_UPDATE: 'ON_UPDATE' // CONVERTED
}

function createPointCloudDBConnection() {
    return mysql.createConnection({
        host     : process.env.HOST,
        user     : process.env.DATABASE_USER,
        password : process.env.PASSWORD,
        port     : process.env.PORT
    });
}

/*============================================================================
  database wrapper for easy-to-read database use;
  if necessary, the methods you want to use from connection must be expanded here
============================================================================*/
function makeDb() {
    const connection = createPointCloudDBConnection();
    return {
        query(sql, args) {
            return util.promisify(connection.query)
                .call(connection, sql, args);
        },
        close() {
            return util.promisify(connection.end).call(connection);
        },
        beginTransaction() {
            return util.promisify(connection.beginTransaction)
                .call(connection);
        },
        commit() {
            return util.promisify(connection.commit)
                .call(connection);
        },
        rollback() {
            return util.promisify(connection.rollback)
                .call(connection);
        }
<<<<<<< HEAD
    };
}

/*============================================================================
  helper function:
  ============================================================================
  when using this function,
    - a transaction is automatically created,
    - standard schema is used initially
    - transaction is automatically committed if successful,
    - transaction is automatically rolled back if an error occurs,
    - and the connection is finally closed automatically
============================================================================*/
async function withTransaction(db, callback) {
    try {
        await db.beginTransaction();
        await db.query("USE " + STANDARD_SCHEMA + ";");
        await callback();
        await db.commit();
    } catch (err) {
        await db.rollback();
        throw err;
    } finally {
        await db.close();
    }
}

async function getPointcloudEntryByCloudnameAndUsername(cloudname, username, callback) {
    try {
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT * FROM cloud_table WHERE cloud_name = ? AND created_by = ?', [cloudname, username]);
            if (result.length == 1) {
                callback(null, result);
            } else {
                throw new Error("pointcloud not found with name = " + cloudname);
            }
=======
        connection.query('USE pointcloudDB;');
        connection.query('SELECT cloud_name, link, public FROM cloud_table WHERE public = TRUE;', function(error, result) {
            callback(error, result, false)
>>>>>>> ee7602b6b02144f8b152209a646d044be7d99674
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

/*============================================================================
    @param user: can either be id or name
============================================================================*/
async function createPointCloudEntry(user, cloud_name, public, upload_status, callback) { // public weg, standard private
    try {
        let user_name;
        const db = makeDb();
        if (user instanceof Number) {
            let user_entry = await db.query('SELECT * FROM user_table WHERE id = ?', user);
            user_name = user_entry[0].user_name;
        } else {
            user_name = user;
        }
        let query = 'INSERT INTO  `pointcloudDB2`.`cloud_table` (cloud_name, created_by, public, upload_status) ' + 
                    'VALUES (?, ?, ?, ?)';
        await withTransaction(db, async () => {
            const result = await db.query(query, [cloud_name, user_name, public, upload_status]);
            callback(null, result)
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function publicClouds(callback) {
    try {
        const db = makeDb();
        let query = 'SELECT cloud_name, link, public FROM cloud_table ' +
                    'WHERE public = TRUE AND id NOT IN ' +
                    '(SELECT cloud_id FROM upload_information_table WHERE upload_status != ?)';
        await withTransaction(db, async () => {
            const result = await db.query(query, "COMPLETED");
            callback(null, result, false)
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function privateClouds(username, callback) {
<<<<<<< HEAD
    try {
        const db = makeDb();
        let query = 'SELECT cloud_name, link, public FROM cloud_table ' +
                    'WHERE ((public = FALSE and created_by = ?) or public = TRUE) AND id NOT IN ' +
                    '(SELECT cloud_id FROM upload_information_table WHERE upload_status != ?)';
        await withTransaction(db, async () => {
            const result = await db.query(query, [username, "COMPLETED"]);
            callback(null, result, true)
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function checkSession(username, callback) {
    try {
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query("SELECT expiration from session_table where user_name = ?;", username);
            callback(null, result)
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
=======
    var connection = createPointCloudDBConnection();

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
        function(error, result) {
            callback(error, result, true)
        });
        connection.end();
    });
}

async function checkSession(username, callback) {
    var connection = createPointCloudDBConnection();

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
            function(error, result) {
                callback(error, result)
            });
        connection.end();
    });
>>>>>>> ee7602b6b02144f8b152209a646d044be7d99674
}

async function login(username, password, callback) {
    var connection = createPointCloudDBConnection();

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
            function(error, result) {
                if(error || !result ||result.length == 0) {
                    callback(false);
                } else {
                    var passwordHash = crypto.pbkdf2Sync(password, result[0].salt, 1000, 64, `sha512`).toString(`hex`);
                    callback(passwordHash === result[0].password_hash);
                }
            });
        connection.end()
    });
}

function setNewSession(username, expiration, callback) {
    var connection = createPointCloudDBConnection();

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
            function(error, result) {
                callback(error, result);
            });
        connection.end();
    });
}

function createNewUser(username, password, callback) {
    var connection = createPointCloudDBConnection();

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
            function(error, result) {
                callback(error, result);
            });
        connection.end();
    });
}

function createNewCloud(cloudName, link, username, callback) {
    var connection = mysql.createConnection({
        host     : process.env.HOST,
        user     : process.env.DATABASE_USER,
        password : process.env.PASSWORD,
        port     : process.env.PORT
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("insert into cloud_table (cloud_name, link, created_by, public) values (?, ?, ?, false);",
            [
                cloudName,
                link,
                username
            ], 
            function(error, result) {
                callback(error, result);
            });
        connection.end();
    });
}

function deleteCloud(cloudName, username, callback) {
    var connection = mysql.createConnection({
        host     : process.env.HOST,
        user     : process.env.DATABASE_USER,
        password : process.env.PASSWORD,
        port     : process.env.PORT
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("delete from cloud_table where created_by = ? and cloud_name = ?;",
            [
                username,
                cloudName
            ], 
            function(error, result) {
                callback(error, result);
            });
        connection.end();
    });
}

async function getUserEntryById(id, callback) {
    try {
        if (!(id instanceof number)) {
            throw err("cannot get user: id has to be a number");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT * FROM user_table WHERE id = ?', id);
            callback(null, result);
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function getUserIdByName(user_name, callback) {
    try {
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT id FROM user_table WHERE user_name = ?', user_name);
            if (result.length == 1) {
                callback(null, result[0].id);
            } else {
                throw new Error("user not found with name = " + user_name);
            }
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function getNextUploadIDByUser(username, password, callback) {
    try {
        const db = makeDb();
        await withTransaction(db, async () => {
            const someRows = await db.query('SELECT * FROM cloud_table WHERE public = ?', 1);
            callback(null, someRows);
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

// TODO write function to store new pointcloud
module.exports = { publicClouds, privateClouds, login, checkSession, setNewSession, createNewUser, getNextUploadIDByUser, createPointCloudEntry, getUserIdByName, getPointcloudEntryByCloudnameAndUsername };
