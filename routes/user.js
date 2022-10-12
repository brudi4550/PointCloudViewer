const dbService = require('../databaseService');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

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

module.exports = function (app) {

    app.get('/login', (req, res) => {
        res.render('login', {
            title: 'Login - PointCloudViewer'
        })
    });

    app.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/');
    })

    app.get('/createNewUser', (req, res) => {
        res.render('createNewUser', {
            titel: 'Create new User - PointCloudViewer'
        })
    })

    app.post('/login', (req, res) => {
        var username = req.body.username;
        var passwordHash = req.body.password;

        function callbackSetNewSession(error, result) {
            if (error) {
                console.log('Error when trying to set new session in database: ' + error);
                res.redirect;
            } else {
                console.log('New session was created');
                req.session.userid = req.body.username;
                res.session = req.session;
                res.status(200).redirect('/');
            }
        }

        function callbackLogin(error, valid) {
            if (valid) {
                dbService.setNewSession(username, Date.now(), callbackSetNewSession);
            } else {
                res.render('login', {
                    error: true,
                    message: 'Invalid data',
                    title: 'Login - PointCloudViewer'
                })
            }
        }

        dbService.authenticateUser(username, passwordHash, callbackLogin);
    })

    // TODO check for special chars
    app.post('/createNewUser', (req, res) => {
        console.log('creating new user');
        function callback(error, result) {
            console.log(error);
            if (error) {
                if (error.code == 'ER_DUP_ENTRY') {
                    var message = 'This username is already used choose another one'
                } else {
                    var message = 'An error occured please try again'
                }
                res.render('createNewUser', {
                    error: true,
                    message: message,
                    titel: 'Create new User - PointCloudViewer'
                })
            } else {
                res.render('successPage', {
                    message: 'A new user was created',
                    title: 'success - PointCloudViewer'
                })
            }
        }
        dbService.createNewUser(req.body.username, req.body.password, callback);
    })

    app.get('/userDeletion', (req, res) => {
        res.render('userDeletion.pug', {
            complete: false
        });
    })

    app.delete('/userDeletion', (req, res) => {
        console.log('user gets deleted');
        const username = req.session.userid;
        function deleteUserCallback(error, result) {
            console.log(error);
            if(error) {
                res.status(402);
                res.send(error);
            } else {
                console.log('success');
                req.session.destroy();
                res.render('userDeletion.pug', {
                    complete: true
                })
            }
        }
        function deleteUserCloudsFromBucket(error, result) {
            if(result) {
                result.forEach( pointcloud => {
                    console.log(pointcloud.cloud_id)
                    console.log(pointcloud.user_id)
                    try {
                        deleteFileFromS3('pointcloud_pages/' + pointcloud.user_id + '/' + pointcloud.cloud_id + '.html');
                        deleteFileFromS3('potree_pointclouds/' + pointcloud.user_id + '/' + pointcloud.cloud_id + '/hierarchy.bin');
                        deleteFileFromS3('potree_pointclouds/' + pointcloud.user_id + '/' + pointcloud.cloud_id + '/metadata.json');
                        deleteFileFromS3('potree_pointclouds/' + pointcloud.user_id + '/' + pointcloud.cloud_id + '/octree.bin');
                    } catch (error){}
                })
            }
            dbService.deleteUser(username, deleteUserCallback);
        }
        function checkSessionCallback(error, result) {
            if(!error && result) {
                dbService.onlyPrivateClouds(username, deleteUserCloudsFromBucket);
            }   
        }
        dbService.checkSession(username, checkSessionCallback);
    })

}