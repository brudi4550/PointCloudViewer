const express = require('express');
const sessions = require('express-session');
const dotenv = require('dotenv').config();
const app = express();
const busboy = require('connect-busboy');   // Middleware to handle the file upload https://github.com/mscdex/connect-busboy
const path = require('path');               // Used for manipulation with path
const fs = require('fs-extra');             // Classic fs
const port = 3000;
const { exec, execFile } = require("child_process");
const { S3Client } = require("@aws-sdk/client-s3");

//session settings
const oneDay = 1000 * 60 * 60 * 24;
app.use(sessions({
  secret: process.env.COOKIE_SECRET,
  saveUninitialized: true,
  cookie: { maxAge: oneDay },
  resave: false
}));
var session;

const users = [];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.use(express.static('public'));

app.use(busboy({
  highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
})); // Insert the busboy middle-ware

const uploadPath = path.join(__dirname, 'fu/'); // Register the upload path
fs.ensureDir(uploadPath); // Make sure that he upload path exits

app.get('/', (req, res) => {
  session = req.session;
  if (session.id) {
    var user = users[session.id];
    res.render('index', {
      title: 'PointCloudViewer',
      user: session.id
    })
  } else {
    res.render('public', {
      title: 'PointCloudViewer'
    })
  }
})

app.get('/register', (req, res) => {
  res.render('register', {
    title: 'Register - PointCloudViewer'
  })
});

app.post('register', (req, res) => {

});

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - PointCloudViewer'
  })
});

app.post('/auth', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const client = new S3Client({
    
  })
  if (username in users && password == password ) {
    
  } 

  res.render('public', {
    title: 'Logged in'
  })
});

app.get('/fileconvert', (req, res) => {
  res.render('fileconvert', {
    title: 'PointCloudViewer',
  })
})

app.post('/fileconvert', (req, res) => {
  console.log('Converting the file has started');
  const path = 'C:/Users/Asus/OneDrive/Desktop/Uni/SS2022/IT_Projekt/PointCloudViewer/';

  exec(path + 'PotreeConverter/PotreeConverter.exe ' + path + 'fu/test_punkt_wolke.las -o ' + path + 'fu/test -generate-page testpage', (error, stdout, stderr) => {
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
  res.redirect('back')
})

app.get('/upload', (req, res) => {
  res.render('upload', {
    title: 'PointCloudViewer',
  })
})


app.route('/upload').post((req, res, next) => {
  console.log('received post request');
  req.pipe(req.busboy); // Pipe it trough busboy
  req.busboy.on('file', (fieldname, file, filename) => {
    console.log(`Upload of '${filename}' started`);
    // Create a write stream of the new file
    //fix naming + file type of uploaded file
    const fstream = fs.createWriteStream(path.join(uploadPath, fieldname));
    // Pipe it trough
    file.pipe(fstream);
    // On finish of the upload
    fstream.on('close', () => {
      console.log(`Upload of '${filename}' finished`);
      res.redirect('back');
    });
  });
});

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})