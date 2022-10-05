const express = require('express');
const sessions = require('express-session');
const app = express();
const path = require('path');
const fs = require('fs-extra');
const port = 3000;
const dbService = require('./databaseService');
const cookieParser = require("cookie-parser");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'));
app.use(cookieParser());

const oneHour = 1000 * 60 * 60;
app.use(sessions({
  secret: process.env.COOKIE_SECRET,
  saveUninitialized: true,
  cookie: { maxAge: oneHour },
  resave: false
}));

const envFilePath = path.join(__dirname, '.env');
if (!fs.existsSync(envFilePath)) {
  console.log('.env file does not exist, application will not work correctly');
}
const uploadPath = path.join(__dirname, 'las/');
fs.ensureDir(uploadPath);
const potreeOutputFolder = path.join(__dirname, 'potree_output/')
fs.ensureDir(potreeOutputFolder);
const potreePageFolder = path.join(__dirname, 'potree_pages/');
fs.ensureDir(potreePageFolder);

require('./routes/api.js')(app);
require('./routes/user.js')(app);

app.get('/', async (req, res) => {
  var session = req.session;
  var username = session.userid;
  console.log(username);
  // first chceck if there is valid session
  function callbackCheckSession(error, result) {
    if (error) {
      console.log(error);
    } else {
      console.log(result);
      if (result.length >= 1 && result[0].expiration < Date.now() + oneHour) {
        dbService.privateClouds(username, callbackReturnClouds);
      } else {
        dbService.publicClouds(callbackReturnClouds);
      }
    }
  }

  function callbackReturnClouds(error, result, validSession) {
    if (error) {
      console.log(error);
    } else {
      console.log(result)
      res.render('index', {
        clouds: result,
        validSession: validSession,
        title: 'PointCloudViewer',
      })
    }
  }
  if (username != null && username != undefined) {
    dbService.checkSession(username, callbackCheckSession);
  } else {
    dbService.publicClouds(callbackReturnClouds);
  }

})

app.get('/upload', (req, res) => {
  res.render('upload', {
    title: 'PointCloudViewer',
  })
})

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})