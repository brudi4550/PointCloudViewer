const dbService = require('../databaseService');
const { exec } = require('child_process');
const dotenv = require('dotenv').config({ path: __dirname + '/.env' })
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const s3 = new S3Client({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const UPLOAD_STATUS_ENUM = {
    UNDEFINED: 'UNDEFINED',
    INITIALIZED: 'INITIALIZED',
    COMPLETE_ORDER_SENT: 'COMPLETE_ORDER_SENT',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    ON_UPDATE: 'ON_UPDATE'
}

function deleteFileFromS3(s3path) {
    (async () => {
        const command = new DeleteObjectCommand({
            Bucket: 'point-clouds',
            Key: s3path
        })
        console.log('deleting ' + s3path + ' from bucket');
        const response = await s3.send(command);
    })();
}

function s3multipartUpload(localPath, s3path, contentType, callback) {
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
        console.log('uploaded ' + s3path + ' to bucket');
        if (callback) {
            callback();
        }
    })();
}

function cleanUpFiles(userId, pointcloudId) {
    const uId = userId.toString();
    const pId = pointcloudId.toString();
    console.log('Upload to S3 completed, deleting all pointcloud files from server');
    fs.rmSync(path.join(__dirname, '..', 'las', uId), { recursive: true, force: true });
    fs.rmSync(path.join(__dirname, '..', 'potree_output', uId), { recursive: true, force: true });
    fs.rmSync(path.join(__dirname, '..', 'potree_pages', uId), { recursive: true, force: true });
}

function getHTTPAuthInfo(req) {
    var authheader = req.headers.authorization;
    if (!authheader) {
        return undefined;
    }
    return new Buffer.from(authheader.split(' ')[1],
        'base64').toString().split(':');
}

//returns undefined if no session exists and no HTTP Auth is included in the request
function getUsername(req) {
    var username;
    var httpAuthInfo = getHTTPAuthInfo(req);
    if (httpAuthInfo === undefined) {
        username = req.session.userid;
    } else {
        username = httpAuthInfo[0];
    }
    return username;
}

function authenticate(req, callback) {

    function sessionResultCallback(error, result) {
        if (error) {
            console.log(error);
        } else {
            const oneHour = 1000 * 60 * 60;
            if (result.length >= 1 && result[0].expiration < Date.now() + oneHour) {
                var pointcloudName = req.params['pointcloudName'];
                if (pointcloudName === undefined) {
                    callback(true);
                } else {
                    dbService.authenticateAction(req.session.userid, req.params['pointcloudName'], callback)
                }
            } else {
                callback(false);
            }
        }
    }

    var sessionUserId = req.session.userid;
    if (sessionUserId != null && sessionUserId != undefined) {
        dbService.checkSession(sessionUserId, sessionResultCallback);
    } else {
        const authInfo = getHTTPAuthInfo(req);
        if (authInfo === undefined) {
            callback(false);
            return;
        }
        const user = authInfo[0];
        const password = authInfo[1];
        const pointcloudName = req.params['pointcloudName'];

        function callbackOnAuthenticationResult(error, valid) {
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

module.exports = function (app) {

    app.patch('/convertFile/:pointcloudId', (req, res) => {
        function callback(validAuth) {
            if (validAuth) {
                const username = getUsername(req);
                const pointcloudId = req.params['pointcloudId'];
                dbService.getUserIdByName(username, (err, userId) => {
                    exec('./PotreeConverter/build/PotreeConverter ./las/' + userId + '/' + pointcloudId + '/' + pointcloudId
                        + '.las -o ./potree_output/' + userId + '/' + pointcloudId, (error, stdout, stderr) => {
                            if (error) {
                                console.log(`error: ${error.message}`);
                                return;
                            }
                            if (stderr) {
                                console.log(`stderr: ${stderr}`);
                                return;
                            }
                            console.log(`stdout: ${stdout}`);
                            res.status(200).send('converting has started');
                        });
                })
            } else {
                res.send('authentication has not been successful');
            }
        }
        authenticate(req, callback);
    })

    app.patch('/sendToS3/:pointcloudId', (req, res) => {
        function callback(validAuth) {
            if (validAuth) {
                const username = getUsername(req);
                const pointcloudId = req.params['pointcloudId'];
                dbService.getUserIdByName(username, (err, userId) => {
                    const suffix = '/' + userId + '/' + pointcloudId + '/';
                    const localPath = './potree_output' + suffix;
                    const s3path = 'potree_pointclouds' + suffix;
                    s3multipartUpload(localPath + 'hierarchy.bin', s3path + 'hierarchy.bin', 'application/octet-stream');
                    s3multipartUpload(localPath + 'metadata.json', s3path + 'metadata.json', 'application/json');
                    s3multipartUpload(localPath + 'octree.bin', s3path + 'octree.bin', 'application/octet-stream', () => {
                        cleanUpFiles(userId, pointcloudId);
                    });
                    res.status(200).send('sent to s3');
                });
            } else {
                res.send('authentication has not been successful');
            }
        }
        authenticate(req, callback);
    })

    app.patch('/generateHTMLPage/:pointcloudId', (req, res) => {
        function callback(validAuth) {
            if (validAuth) {
                const username = getUsername(req);
                const pointcloudId = req.params['pointcloudId'];
                dbService.getUserIdByName(username, (err, userId) => {
                    const localPath = './potree_pages/' + userId + '/' + pointcloudId + '.html';
                    const s3path = 'pointcloud_pages/' + userId + '/' + pointcloudId + '.html';
                    exec('mkdir ./potree_pages/' + userId, (error, stdout, stderr) => {
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
                    exec('cp ./resources/template.html ./potree_pages/' + userId + '/' + pointcloudId + '.html', (error, stdout, stderr) => {
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
                            var result = data.replace(/USERNAME/g, userId).replace(/POINTCLOUD_NAME/g, pointcloudId);
                            fs.writeFile(localPath, result, 'utf8', function (err) {
                                if (err) return console.log(err);
                                s3multipartUpload(localPath, s3path, 'text/html');
                            });
                        });
                        dbService.updateLink('http://' + process.env.S3_BUCKET_BASE_URL + '/' + s3path, username, pointcloudId, (err, result) => {
                            res.send('HTML page generated');
                        });
                    })
                });
            }
        }
        authenticate(req, callback);
    })

    app.post('/storeCloud/:pointcloudName', (req, res) => {
        function callback() {
            const user = getUsername(req);
            const pointcloudName = req.param['pointcloudName'];
            // TODO check how to get the link 
            const pointcloudLink = req.body.pointcloudLink;
            if (user === undefined || pointcloudName === undefined || pointcloudLink === undefined) {
                res.status(400);
                res.send('user, pointcloud or link could not be found');
            } else {
                function databaseCallback(error, result) {
                    if (error) {
                        res.status(400);
                        res.send('the cloud could not be stored in the database');
                    } else {
                        res.status(200);
                        res.send('The pointcloud has been stored in the database');
                    }
                }
                dbService.createNewCloud(pointcloudName, pointcloudLink, user, databaseCallback);
            }

        }
        authenticate(req, callback);
    })

    app.delete('/:pointcloudName', (req, res) => {
        console.log('delete request : ' + req.params['pointcloudName']);
        function callback() {
            const pointcloudName = req.params['pointcloudName'];
            const user = getUsername(req);
            if (pointcloudName == undefined) {
                res.status(400);
                res.send('No pointcloudName could be found');
            } else if (user == undefined) {
                res.status(401);
                res.send('No user was provided to perform the task')
            } else {
                function databaseCallback(error, result) {
                    if (error) {
                        console.log(error);
                        res.status(400)
                        res.send('Could not execute database query');
                    } else {
                        if (result.affectedRows >= 1) {
                            res.status(200);
                            res.send('The pointcloud has been deleted successfully');
                        } else {
                            res.status(200);
                            res.send('The pointcloud was not found for this user');
                        }
                    }
                }
                dbService.getUserIdByName(user, (err, userId) => {
                    dbService.getPointcloudEntryByCloudnameAndUsername(pointcloudName, user, (err, result) => {
                        const pointcloudId = result.id;
                        deleteFileFromS3('pointcloud_pages/' + userId + '/' + pointcloudId + '.html');
                        deleteFileFromS3('potree_pointclouds/' + userId + '/' + pointcloudId + '/hierarchy.bin');
                        deleteFileFromS3('potree_pointclouds/' + userId + '/' + pointcloudId + '/metadata.json');
                        deleteFileFromS3('potree_pointclouds/' + userId + '/' + pointcloudId + '/octree.bin');
                        dbService.deleteCloud(pointcloudName, user, databaseCallback)
                    });
                });
            }
        }
        authenticate(req, callback);
    })

    /*============================================================================
      GET: /pointcloud/:cloud_name
    ============================================================================*/
    app.get('/pointcloud/:cloud_name', (request, response) => {
        function callback(valid) {
            if (valid) {
                dbService.getPointcloudEntryByCloudnameAndUsername(request.params.cloud_name, request.session.userid, function (err, result) {
                    if (err && err.message.startsWith("pointcloud not found with name = ")) {
                        return response
                            .status(404)
                            .send(err);
                    }
                    if (err) {
                        return response
                            .status(500)
                            .send(err);
                    }
                    if (result) {
                        return response
                            .status(200)
                            .send(result);
                    }
                })
            } else {
                return response.status(401).send('Authentication failed');
            }
        }
        authenticate(request, callback);
    });

    /*============================================================================
      PUT: /multipart-upload/start-upload
    ------------------------------------------------------------------------------
      prepares the server for an upcoming upload
        - creates pointcloud entry in database
        - create directory for the planned upload 
    ============================================================================*/
    app.put('/multipart-upload/start-upload', (request, response) => {
        function callback(valid) {
            if (valid) {
                const UPLOAD_FOLDER_PATH = path.join(__dirname, '..', 'las');
                let userID,
                    cloudID;
                try {
                    dbService.createPointCloudEntry(request.session.userid, request.body.cloud_name, 0, UPLOAD_STATUS_ENUM.INITIALIZED, function (err, id) {
                        if (err) {
                            return response
                                .status(500)
                                .json("creating pointcloud entry failed", err)
                        } else {
                            cloudID = id;
                            dbService.getUserIdByName(request.session.userid, function (err, id) {
                                if (err) {
                                    return response.status(500).send({ error: err.message })
                                }
                                userID = id;
                                // create directory for the planned upload
                                fs.ensureDirSync(path.join(UPLOAD_FOLDER_PATH, userID.toString(), cloudID.insertId.toString()));
                                return response
                                    .status(200)
                                    .location("/multipart-upload/" + cloudID.toString())
                                    .send({
                                        // id: uploadID,
                                        chunkSizeInBit: 1024 * 1024 / 2,
                                        uploadCompleted: false
                                    })
                            });
                        }
                    });
                } catch (err) {
                    return response
                        .status(500)
                        .send("Unbekannter Fehler", err)
                }
            } else {
                response.status(401).send('Authentication failed.');
            }
        }
        authenticate(request, callback);
    })

    /*============================================================================
      PUT: /multipart-upload
    ============================================================================*/
    // storage controls the server-side disk-storage of the incoming files
    const STORAGE = multer.diskStorage({
        destination: function (request, file, callback) {
            dbService.getUserIdByName(request.session.userid, function (err, user_id) {
                if (err) {
                    throw new Error(err.message);
                }
                callback(null, path.join(__dirname, '..', 'las', user_id.toString(), request.body.id));
            })
        },
        filename: function (request, file, callback) {
            callback(null, file.originalname + request.body.part);
        },
    });
    const UPLOAD = multer({ storage: STORAGE });

    app.put('/multipart-upload', UPLOAD.single("fileToUpload"), (request, response) => {
        // uploaded binary data already saved at this point
        return response
            .status(200)
            .json("Multipart-Upload erfolgreich.");
    });

    /*============================================================================
      POST: /multipart-upload/complete-upload
    ============================================================================*/
    app.post('/multipart-upload/complete-upload', (request, response) => {
        dbService.getUserIdByName(request.session.userid, function (err, user_id) {
            if (err) { throw new Error(err.message); }
            const UPLOAD_FOLDER_PATH = path.join(__dirname, '..', 'las', user_id.toString(), request.body.id);
            if (!mergeUploadedChunksIntoFinalFile(user_id, request.body.id)) {
                return response
                    .status(500)
                    .json("Das Zusammensetzen der Upload-Teile hat nicht funktioniert.");
            }
            if (!deleteChunks(UPLOAD_FOLDER_PATH)) {
                return response
                    .status(500)
                    .json("Beim Löschen der einzelnen Upload-Teile ist ein Fehler aufgetreten.");
            }
            return response
                .status(200)
                .json("Multipart-Upload erfolgreich zusammengesetzt.");
            // FIXME: set db completed status to true
            // FIXME: delete local files
        })

    });

    function mergeUploadedChunksIntoFinalFile(user_id, cloud_id) {
        try {
            const mergedFilename = cloud_id + ".las";
            const uploadFolderPath = path.join(__dirname, '..', 'las', user_id.toString(), cloud_id);
            // delete merged file if exists (necessary if an error has occurred previously)
            if (fs.existsSync(path.join(uploadFolderPath, mergedFilename))) {
                fs.unlinkSync(path.join(uploadFolderPath, mergedFilename));
            }
            // read each chunk and merge it into final file
            const filenames = fs.readdirSync(uploadFolderPath);
            filenames // chunks are numbered, but stored without leading zeros; therefore they must first be sorted
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .forEach(function (chunkFilename) {
                    if (fs.statSync(path.join(uploadFolderPath, chunkFilename)).isFile()) {
                        const data = fs.readFileSync(path.join(uploadFolderPath, chunkFilename));
                        fs.appendFileSync(path.join(uploadFolderPath, mergedFilename), data);
                    };
                });
        } catch (error) {
            console.error(error);
            return false;
        }
        return true;
    }

    function deleteChunks(filestorage_path) {
        try {
            const filenames = fs.readdirSync(filestorage_path);
            filenames.forEach(function (filename) {
                if (fs.statSync(path.join(filestorage_path, filename)).isFile() && !filename.endsWith(".las")) {
                    fs.unlinkSync(path.join(filestorage_path, filename));
                };
            })
        } catch (error) {
            console.error(error);
            return false;
        }
        return true;
    }

}
