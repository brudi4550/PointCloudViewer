const dbService = require('../databaseService');
const { exec } = require('child_process');
const dotenv = require('dotenv').config({ path: __dirname + '/.env' })
const fs = require('fs-extra');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const s3 = new S3Client({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

module.exports = function (app) {

    function s3multipartUpload(localPath, s3path, contentType) {
        var fileStream = fs.createReadStream(localPath);
        (async () => {
            const parallelUploads3 = new Upload({
                client: s3,
                params: {
                    ContentType: contentType,
                    Bucket: 'point-clouds',
                    Key: s3path,
                    Body: fileStream
                },
                queueSize: 4, // optional concurrency configuration
                partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
                leavePartsOnError: false, // optional manually handle dropped parts
            });

            parallelUploads3.on("httpUploadProgress", (progress) => {
                console.log(progress);
            });

            await parallelUploads3.done();
        })();
    }

    function getAuthInfo(req) {
        var authheader = req.headers.authorization;
        if (!authheader) {
            return undefined;
        }
        return new Buffer.from(authheader.split(' ')[1],
            'base64').toString().split(':');
    }

    function authenticate(req, callback) {

        function sessionResultCallback(error, result) {
            if (error) {
                console.log(error);
            } else {
                const oneHour = 1000 * 60 * 60;
                if (result.length >= 1 && result[0].expiration < Date.now() + oneHour) {
                    dbService.authenticateAction(req.session.userid, req.params['pointcloudName'], callback)
                } else {
                    callback(false);
                }
            }
        }

        var sessionUserId = req.session.userid;
        if (sessionUserId != null && sessionUserId != undefined) {
            dbService.checkSession(sessionUserId, sessionResultCallback);
        } else {
            const authInfo = getAuthInfo(req);
            if (authInfo === undefined) {
                callback(false);
                return;
            }
            const user = authInfo[0];
            const password = authInfo[1];
            const pointcloudName = req.params['pointcloudName'];

            function callbackOnAuthenticationResult(valid) {
                if (pointcloudName === undefined) {
                    callback(valid);
                    return;
                } else {
                    if (valid) {
                        dbService.authenticateAction(user, pointcloudName, callback);
                    } else {
                        callback(valid);
                        return;
                    }
                }
            }

            dbService.authenticateUser(user, password, callbackOnAuthenticationResult);
        }
    }

    app.patch('/convertFile/:pointcloudName', (req, res) => {
        function callback(validAuth) {
            if (validAuth) {
                const user = getAuthInfo(req)[0];
                const pointcloudName = req.params['pointcloudName'];
                exec('./PotreeConverter/build/PotreeConverter ./las/' + user + '/' + pointcloudName
                    + '.las -o ./potree_output/' + user + '/' + pointcloudName, (error, stdout, stderr) => {
                        if (error) {
                            console.log(`error: ${error.message}`);
                            return;
                        }
                        if (stderr) {
                            console.log(`stderr: ${stderr}`);
                            return;
                        }
                        console.log(`stdout: ${stdout}`);
                    });
                res.send('converting has started')
            } else {
                res.send('authentication has not been successful');
            }
        }
        authenticate(req, callback);
    })

    app.patch('/sendToS3/:pointcloudName', (req, res) => {
        console.log()
        function callback(validAuth) {
            if (validAuth) {
                const user = getAuthInfo(req)[0];
                const pointcloudName = req.params['pointcloudName'];
                const suffix = '/' + user + '/' + pointcloudName + '/';
                const localPath = './potree_output' + suffix;
                const s3path = 'potree_pointclouds' + suffix;
                s3multipartUpload(localPath + 'hierarchy.bin', s3path + 'hierarchy.bin', 'application/octet-stream');
                s3multipartUpload(localPath + 'metadata.json', s3path + 'metadata.json', 'application/json');
                s3multipartUpload(localPath + 'octree.bin', s3path + 'octree.bin', 'application/octet-stream');
                res.send('sent to s3');
            } else {
                res.send('authentication has not been successful');
            }
        }
        authenticate(req, callback);
    })

    app.patch('/generateHTMLPage/:pointcloudName', (req, res) => {
        function callback(validAuth) {
            if (validAuth) {
                const pointcloudName = req.params['pointcloudName'];
                const user = getAuthInfo(req)[0];
                const localPath = './potree_pages/' + user + '/' + pointcloudName + '.html';
                const s3path = 'pointcloud_pages/' + user + '/' + pointcloudName + '.html';
                exec('mkdir ./potree_pages/' + user, (error, stdout, stderr) => {
                    if (error) {
                        console.log(`error: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.log(`stderr: ${stderr}`);
                        return;
                    }
                    console.log(`stdout: ${stdout}`);
                });
                exec('cp ./resources/template.html ./potree_pages/' + user + '/' + pointcloudName + '.html', (error, stdout, stderr) => {
                    if (error) {
                        console.log(`error: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.log(`stderr: ${stderr}`);
                        return;
                    }
                    console.log(`stdout: ${stdout}`);
                    fs.readFile(localPath, 'utf8', function (err, data) {
                        if (err) {
                            return console.log(err);
                        }
                        var result = data.replace(/USERNAME/g, user).replace(/POINTCLOUD_NAME/g, pointcloudName);
                        fs.writeFile(localPath, result, 'utf8', function (err) {
                            if (err) return console.log(err);
                            s3multipartUpload(localPath, s3path, 'text/html');
                        });
                    });
                });
                res.send('HTML page generated');
            } else {
                res.send('authentication has not been successful');
            }
        }
        authenticate(req, callback);
    })
}
