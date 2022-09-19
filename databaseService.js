const mysql = require('mysql');

async function getClouds(callback) {
    var connection = mysql.createConnection({
        host     : "---",
        user     : "admin",
        password : "---",
        port     : "3306"
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query('SELECT * FROM cloud_table WHERE public = TRUE;', function(error, result, fields) {
            callback(result)
        });
        connection.end()
    })
}

async function login(username, passwordhash, callback) {
    var connection = mysql.createConnection({
        host     : "---",
        user     : "admin",
        password : "---",
        port     : "3306"
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("SELECT user_name FROM user_table WHERE user_name = ? AND password_hash = ?;", 
            [
                username,
                passwordhash
            ], 
            function(error, result, fields) {
                callback(error,result)
            });
        connection.end()
    })
}

function createSession(username, expiration, callback) {
    var connection = mysql.createConnection({
        host     : "---",
        user     : "admin",
        password : "---",
        port     : "3306"
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        connection.query('USE pointcloudDB;');
        connection.query("insert into session_table (user_name, timestamp) values(?, ?);", 
            [
                username,
                expiration
            ], 
            function(error, result, fields) {
                callback(error,result)
            });
        connection.end()
    }) 
}
module.exports = { getClouds, login, createSession };