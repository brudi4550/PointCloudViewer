const dbService = require('../databaseService');

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

}