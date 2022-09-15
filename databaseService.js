const mysql = require('mysql');

async function getClouds(callback) {
    var connection = mysql.createConnection({
        host     : "database-pointcloudviewer.cvohz8fwaj3u.eu-central-1.rds.amazonaws.com",
        user     : "admin",
        password : "F27RsZG5PECjYPNoWKuN",
        port     : "3306"
    });

    connection.connect(function(err) {
        if(err) {
            console.error('Database connection failed: ' + err.stack);
            return;
        }
        console.log('Connected to database');
        connection.query('USE pointcloudDB');
        connection.query('SELECT * FROM cloud_table WHERE public = TRUE;', function(error, result, fields) {
            console.log(result);
            callback(result)
        });
        connection.end()
    })
}

module.exports = { getClouds };