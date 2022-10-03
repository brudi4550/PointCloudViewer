const dbService = require('../databaseService');
const exec = require("child_process");

module.exports = function (app) {

    function upload(localPath, s3path) {
        fs.readFile(localPath, (err, data) => {
            if (err) throw err;
            const params = {
                Bucket: 'point-clouds',
                Key: s3path,
                Body: JSON.stringify(data, null, 2)
            };
            s3.upload(params, function (s3Err, data) {
                if (s3Err) throw s3Err
                console.log(`File uploaded successfully at ${data.Location}`)
            });
        });
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
        const authInfo = getAuthInfo(req);
        if (authInfo === undefined) {
            return false;
        }
        const user = authInfo[0];
        const password = authInfo[1];
        const pointcloudName = req.params['pointcloudName'];

        function callbackOnAuthenticationResult(valid) {
            if (pointcloudName === undefined) {
                callback(valid);
            } else {
                if (valid) {
                    dbService.authenticateAction(user, pointcloudName, callback);
                } else {
                    callback(valid);
                }
            }
        }

        dbService.authenticateUser(user, password, callbackOnAuthenticationResult);
    }

    //delete this later
    //to test enter credentials in Basic HTTP Auth in postman and send patch request to URL /testAPI/*yourpointcloudname*
    app.patch('/testAPI/:pointcloudName', (req, res) => {
        function callback() {
            console.log('authentication successful');
        }
        authenticate(req, callback);
        res.send('test');
    })

    app.patch('/convertFile/:pointcloudName', (req, res) => {
        function callback() {
            const user = getAuthInfo(req)[0];
            const pointcloudName = req.params['pointcloudName'];
            exec('./PotreeConverter/build/PotreeConverter ./las/' + user + '/' + pointcloudName
                + '.las -o ./potree_output/pointcloud_' + id + '&', (error, stdout, stderr) => {
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
        }
        authenticate(req, callback);
    })

    app.patch('/sendToS3/:pointcloudName', (req, res) => {
        function callback() {
            const user = getAuthInfo(req)[0];
            const pointcloudName = req.params['pointcloudName'];
            const files = ['hierarchy.bin', 'metadata.json', 'octree.bin'];
            const suffix = '/' + user + '/' + pointcloudName + '/';
            const localPath = '../potree_output';
            const s3path = 'potree_pointclouds';
            files.forEach(elem => {
                upload(localPath + suffix + elem, s3path + suffix + elem);
            });
            res.send('sent to s3');
        }
        authenticate(req, callback);
    })


    app.post('/storeCloud/:pointcloudName', (req, res) => {
        function callback() {
            const user = getAuthInfo(req)[0];
            const pointcloudName = req.param['pointcloudName'];
            // TODO check how to get the link 
            const pointcloudLink = req.body.pointcloudLink;
            if(user === undefined || pointcloudName === undefined ||pointcloudLink === undefined) {
                res.status(400);
                res.send('user, pointcloud or link could not be found');
            } else {
                function databaseCallback(error, result) {
                    if(error) {
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
        authenticate(req,callback);
    })

    app.patch('/generateHTMLPage/:pointcloudName', (req, res) => {
        function callback() {
            const pointcloudName = req.params['pointcloudName'];
            const user = getAuthInfo(req)[0];
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
            });

            fs.readFile('../resources/template.html', 'utf8', function (err, data) {
                if (err) {
                    return console.log(err);
                }
                var result = data.replace(/POINTCLOUD_NAME/g, pointcloudName);
                const params = {
                    Bucket: 'point-clouds',
                    Key: 'pointcloud_pages/' + user + '/' + pointcloudName + '.html',
                    Body: JSON.stringify(result, null, 2)
                };
                s3.upload(params, function (s3Err, data) {
                    if (s3Err) throw s3Err
                    console.log(`File uploaded successfully at ${data.Location}`)
                });
            });
            res.send('HTML page generated');
        }
        authenticate(req, callback);
    })

    app.delete('/:pointcloudName', (req, res) => {
        console.log('delete request : ' + req.params['pointcloudName']);
        function callback() {
            const pointcloudName = req.params['pointcloudName'];
            const user = getAuthInfo(req)[0];
            if(pointcloudName == undefined) {
                res.status(400);
                res.send('No pointcloudName could be found');
            } else if(user == undefined) {
                res.status(401);
                res.send('No user was provided to perform the task')
            } else {
                function databaseCallback(error, result) {
                    if(error) {
                        console.log(error);
                        res.status(400)
                        res.send('Could not execute database query');
                    } else {
                        if(result.affectedRows >= 1) {
                            res.status(200);
                            res.send('The pointcloud could have been deleted successfully');
                        } else {
                            res.status(200);
                            res.send('The pointcloud was not found for this user');
                        }
                    }
                }
                dbService.deleteCloud(pointcloudName, user, databaseCallback);
            }
        }
        authenticate(req, callback);
    })
}
