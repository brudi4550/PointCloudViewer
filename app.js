const express = require('express');
const sessions = require('express-session');
const dotenv = require('dotenv').config();
const app = express();
const busboy = require('connect-busboy');   // Middleware to handle the file upload https://github.com/mscdex/connect-busboy
const path = require('path');               // Used for manipulation with path
const fs = require('fs-extra');             // Classic fs
const port = 3000;
const { exec, execFile } = require("child_process");
const dbService = require('./databaseService');
const cookieParser = require("cookie-parser");
const { S3Client } = require("@aws-sdk/client-s3");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.use(express.static('public'));

app.use(busboy({
  highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
})); // Insert the busboy middle-ware


app.use(cookieParser());

const oneHour = 1000 * 60 * 60;
app.use(sessions({
  secret: 'willBeAddedLater',
  saveUninitialized: true,
  cookie: { maxAge: oneHour },
  resave: false
}));

const uploadPath = path.join(__dirname, 'fu/'); // Register the upload path
fs.ensureDir(uploadPath); // Make sure that he upload path exits

app.get('/', async (req, res) => {
  var session = req.session;
  console.log(session.userid);
  function callback(error, result) {
    if(error) {
      console.log(error);
    } else {
      console.log(result)
      res.render('index', {
        clouds: [],
        title: 'PointCloudViewer',
      })
    }
  }
  dbService.checkIfValidSession(session.userid, callback)
})
  // List is hardcoded now will be Get request to bucket later
  function callback(result) {
    let clouds = result
    res.render('index', {
      clouds: clouds,
      title: 'PointCloudViewer',
    })
  }
  dbService.getClouds(callback);
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

app.get('/fileconvert', (req, res) => {
  res.render('fileconvert', {
    title: 'PointCloudViewer',
  })
})

app.post('/fileconvert', (req, res) => {
  console.log('Converting the file has started');
  const path = '---';
  exec(path + '/PotreeConverter.exe ' + 'PotreeConverter/point_cloud.las -o PotreeConverter/test', (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    res.redirect('back')
  });
})

app.post('/login', (req, res) => {
  function callback(error, result) {
    if (error) {
      console.log('Error when tryed to log in');
      res.redirect;
    } else {
      console.log(result);
      if(result.length > 0) {
        function innerCallback (error, result) {
          if(error) {
            req.session.destroy();
            res.status(401).redirect('/login');
          } else {
            req.session.userid=req.body.username;
            res.session = req.session;
            res.status(200).redirect('/');
          }
          
        }
        dbService.createSession(req.body.username, Date.now(), innerCallback)
      } else {
        req.session.destroy();
        res.status(401).redirect('/login');
      }
    }
  }
  dbService.login(req.body.username, req.body.password, callback);
})

app.get('/upload', (req, res) => {
  res.render('upload', {
    title: 'PointCloudViewer',
  })
})

app.route('/upload').post(async (req, res, next) => {
  console.log('received post request');
  var awaitUpload = new Promise(function (resolve, reject) {
    try {
      req.pipe(req.busboy); // Pipe it trough busboy
      req.busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log(fieldname)
        console.log(filename.filename)
        console.log(`Upload of '${filename.filename}' started`);
        // Create a write stream of the new file
        //fix naming + file type of uploaded file
        const fstream = fs.createWriteStream(path.join(uploadPath, filename.filename));
        // Pipe it trough
        file.pipe(fstream);
        // On finish of the upload
        fstream.on('close', () => {
          console.log(`Upload of '${filename.filename}' finished`);
          resolve(filename.filename)
        });
      });
    } catch (error) {
      reject(error)
    }
  })
  awaitUpload.then(resolve => {
    convertFilePromise(resolve).then(resolve2 => {
      console.log('Request has been returned')
      res.redirect('back')
    })
  });
});

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})
