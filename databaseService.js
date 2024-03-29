const mysql = require('mysql');
const dotenv = require('dotenv').config();
const crypto = require('crypto');
const util = require('util');

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
        host: process.env.HOST,
        user: process.env.DATABASE_USER,
        password: process.env.PASSWORD,
        port: process.env.PORT
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
            const result = await db.query('SELECT * FROM cloud_table WHERE cloud_name = ? AND created_by = ?;', [cloudname, username]);
            if (result.length == 1) {
                callback(null, result[0]);
            } else {
                throw new Error("pointcloud not found with name = " + cloudname);
            }
        });
    } catch (err) {
        callback(err);
    }
}

/*============================================================================
    @param user: can either be id or name
============================================================================*/
async function createPointCloudEntry(user, cloud_name, upload_status, callback) {
    try {
        let user_name;
        const db = makeDb();
        if (user instanceof Number) {
            let user_entry = await db.query('SELECT * FROM user_table WHERE id = ?', user);
            user_name = user_entry[0].user_name;
        } else {
            user_name = user;
        }
        let query = 'INSERT INTO `cloud_table` (cloud_name, created_by, upload_status, public) ' +
            'VALUES (?, ?, ?, ?)';
        await withTransaction(db, async () => {
            const result = await db.query(query, [cloud_name, user_name, upload_status, false]);
            callback(null, result)
        });
    } catch (err) {
        console.log("createPointCloudEntry", err);
        callback(err);
    }
}

/*============================================================================
    @param user: can either be id or name
============================================================================*/
async function updatePointCloudEntry(cloud_id, user, cloud_name, upload_status, callback) {
    try {
        console.log("cloud_id: ", cloud_id, "user", user, "cloud_name", cloud_name, "upload_status", upload_status);
        let user_name;
        const db = makeDb();
        if (user instanceof Number) {
            let user_entry = await db.query('SELECT * FROM user_table WHERE id = ?', user);
            user_name = user_entry[0].user_name;
        } else {
            user_name = user;
        }
        let query = 'UPDATE `cloud_table`' +
                    'SET cloud_name = ?, created_by = ?, upload_status = ? ' +
                    'WHERE id = ?';
        await withTransaction(db, async () => {
            const result = await db.query(query, [cloud_name, user_name, upload_status, cloud_id]);
            callback(null, result)
        });
    } catch (err) {
        console.log("updatePointCloudEntry", err);
        callback(err);
    }
}

async function publicClouds(callback) {
    try {
        const db = makeDb();
        let query = 'SELECT cloud_name, link, public FROM cloud_table WHERE public = TRUE;'
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
    try {
        const db = makeDb();
        let query = 'SELECT cloud_name, link, public FROM cloud_table ' +
            'WHERE ((public = FALSE and created_by = ?) or public = TRUE)';
        await withTransaction(db, async () => {
            const result = await db.query(query, [username, "COMPLETED"]);
            callback(null, result, true)
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function onlyPrivateClouds(username, callback) {
    try {
        const db = makeDb();
        let query = 'SELECT cloud_table.id cloud_id,  user_table.id user_id '+
            'FROM cloud_table, user_table ' + 
            'WHERE cloud_table.created_by = user_table.user_name ' + 
            'and cloud_table.public = FALSE and cloud_table.created_by = ?;';
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
        if (username === undefined) {
            throw err("The username is not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT expiration from session_table where user_name = ?;', username);
            callback(null, result);
        });
    } catch (err) {
        console.error(err);
        callback(err, false);
    }
}

async function setNewSession(username, expiration, callback) {
    try {
        if (username === undefined) {
            throw err("The username or the cloudname are not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('INSERT INTO session_table (user_name, expiration) VALUES (?, ?) ON DUPLICATE KEY UPDATE expiration = ?;', [username, expiration, expiration]);
            callback(null, result)
        });
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

async function createNewUser(username, password, callback) {
    try {
        if (username === undefined || password === undefined) {
            throw err("The username or the cloudname are not defined");
        }
        var salt = crypto.randomBytes(16).toString('hex');
        var hash = crypto.pbkdf2Sync(password, salt,
            1000, 64, `sha512`).toString(`hex`);
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('INSERT INTO user_table (user_name, password_hash, salt) VALUES (?, ?, ?);', [username, hash, salt]);
            callback(null, result)
        });
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

async function createNewCloud(cloudName, link, username, callback) {
    try {
        if (username === undefined || cloudName === undefined || link === undefined) {
            throw err("The username, link or cloudname are not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('INSERT INTO cloud_table (cloud_name, link, created_by, public) VALUES (?, ?, ?, false);', [cloudName, link, username]);
            callback(null, result)
        });
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

async function authenticateUser(username, password, callback) {
    try {
        if (username === undefined) {
            throw err("The username is not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT salt, password_hash FROM user_table WHERE user_name = ?;', username);
            if (!result && result.length == 0) {
                callback(null, false);
            } else {
                var passwordHash = crypto.pbkdf2Sync(password, result[0].salt, 1000, 64, `sha512`).toString(`hex`);
                callback(null, passwordHash === result[0].password_hash);
            }
        });
    } catch (err) {
        console.error(err);
        callback(err, false);
    }
}

//function assumes user has already been authenticated
async function authenticateAction(username, cloudName, callback) {
    try {
        if (username === undefined || cloudName === undefined) {
            throw err("The username or the cloudname are not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('SELECT cloud_name, user_name FROM cloud_table INNER JOIN user_table ON ' +
                'cloud_table.created_by = user_table.user_name ' +
                'WHERE user_table.user_name = ? ' +
                'AND cloud_table.cloud_name = ?;', [username, cloudName]);
            callback(result || result.length != 0);
        });
    } catch (err) {
        console.error(err);
        callback(false);
    }
}

async function deleteCloud(cloudName, username, callback) {
    try {
        if (cloudName === undefined || username === undefined) {
            throw err("The username or the cloudname are not defined");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('delete from cloud_table where created_by = ? and cloud_name = ?;', [username, cloudName]);
            callback(null, result);
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

async function deleteUser(username, callback) {
    try {
        if(username === undefined) {
            throw err("No username was provided");
        }
        const db = makeDb();
        await withTransaction(db, async () => {
            const result = await db.query('DELETE FROM user_table WHERE user_name = ?;', [username]);
            callback(null, result);
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
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

async function updateLink(link, username, pointcloudId, callback) {
    try {
        const db = makeDb();
        await withTransaction(db, async () => {
            const updatedRows = await db.query('UPDATE cloud_table SET link = ? WHERE id = ? AND created_by = ?;', [link, pointcloudId, username]);
            callback(null, updatedRows);
        });
    } catch (err) {
        console.error(err);
        callback(err);
    }
}

// TODO write function to store new pointcloud
module.exports = {
    publicClouds,
    privateClouds,
    onlyPrivateClouds,
    checkSession,
    setNewSession,
    createNewUser,
    createNewCloud,
    getNextUploadIDByUser,
    createPointCloudEntry,
    getUserIdByName,
    getPointcloudEntryByCloudnameAndUsername,
    authenticateAction,
    authenticateUser,
    deleteCloud,
    deleteUser,
    updateLink,
    updatePointCloudEntry
};
