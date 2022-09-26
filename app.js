const express = require('express');
const multer = require('multer');
const sessions = require('express-session');
const dotenv = require('dotenv').config({ path: __dirname + '/.env' })
const app = express();
const busboy = require('connect-busboy');   // Middleware to handle the file upload https://github.com/mscdex/connect-busboy
const path = require('path');               // Used for manipulation with path
const fs = require('fs-extra');             // Classic fs
const port = 3000;
const { exec, execFile } = require("child_process");
const { stderr, env } = require('process');
const dbService = require('./databaseService');
const cookieParser = require("cookie-parser");
const crypto = require('crypto'); 
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'));

app.use(busboy({
  highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
})); // Insert the busboy middle-ware


app.use(cookieParser());

const oneHour = 1000 * 60 * 60;
app.use(sessions({
  secret: process.env.COOKIE_SECRET,
  saveUninitialized: true,
  cookie: { maxAge: oneHour },
  resave: false
}));

const uploadPath = path.join(__dirname, 'fu/'); // Register the upload path
fs.ensureDir(uploadPath); // Make sure that he upload path exits

app.get('/', async (req, res) => {
  var session = req.session;
  var username = session.userid;
  console.log(username);
  // first chceck if there is valid session
  function callbackCheckSession(error, result) {
    if(error) {
      console.log(error);
    } else {
      console.log(result);
      if(result.length >= 1 && result[0].expiration < Date.now() + oneHour) {
        dbService.privateClouds(username, callbackReturnClouds);
      } else {
        dbService.publicClouds(callbackReturnClouds)
      }
    }
  }

  function callbackReturnClouds(error, result, validSession) {
    if(error) {
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
  if(username != null && username != undefined) {
    dbService.checkSession(username, callbackCheckSession);
  } else {
    dbService.publicClouds(callbackReturnClouds);
  }
  
})

// TODO write new section to store a user

app.get('/register', (req, res) => {
  res.render('register', {
    title: 'Register - PointCloudViewer'
  })
});

app.post('register', (req, res) => {

});

app.get('/fileconvert', (req, res) => {
  res.render('fileconvert', {
    title: 'PointCloudViewer',
  })
})

app.post('/fileconvert', (req, res) => {
  console.log('Converting the file has started');
  //only works on linux and probably mac
  exec('~/PointCloudViewer/PotreeConverter/build/PotreeConverter ~/PointCloudViewer/las/point_cloud.las -o ~/PointCloudViewer/output', (error, stdout, stderr) => {
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
  //after finished fileconvert upload to s3
})

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - PointCloudViewer'
  })
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
})


app.post('/login', (req, res) => {
  var username = req.body.username;
  var passwordHash = req.body.password;

  function callbackSetNewSession(error, result) {
    if(error){
      console.log('Error when trying to set new session in database: ' + error);
      res.redirect;
    } else {
      console.log('New session was created');
      req.session.userid=req.body.username;
      res.session = req.session;
      res.status(200).redirect('/');
    }
  }

  function callbackLogin(valid) {
    if(valid) {
      dbService.setNewSession(username, Date.now(), callbackSetNewSession);
    } else {
      res.render('login', {
        error: true,
        message: 'Invalid data',
        title: 'Login - PointCloudViewer'
      })
    }
  }

  dbService.login(username, passwordHash, callbackLogin);
})

app.get('/upload', (req, res) => {
  res.render('upload', {
    title: 'PointCloudViewer',
  })
})

app.get('/createNewUser', (req, res) => {
  res.render('createNewUser', {
    titel: 'Create new User - PointCloudViewer'
  })
})

app.post('/createNewUser', (req, res) => {
  console.log('creating new user');
  function callback(error, result) {
    console.log(error);
    if(error) {
      if(error.code == 'ER_DUP_ENTRY') {
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

app.put('/multipart-upload', (request, response) => {
  // 
});

// controls the server-side-storage of multipart-uploads
const storage = multer.diskStorage({
  destination: "./uploadFiles/",
  filename: function (request, file, callback) {
    callback(null, file.originalname + request.body.part);
    // callback(null, request.body.name + request.body.part);
  },
});
const upload = multer({ storage: storage });

app.post('/multipart-upload', upload.single("fileToUpload"), (request, response) => {
  // Hier kommt der jeweilige Chunk rein. Gespeichert wird der Chunk ohne weiteres Zutun im angegebenen storage.

  // TODO: Basierend auf den Metadaten des Post-Requests muss sich der storage entsprechend anpassen.

  // Wenn der Upload fertig ist (TODO: part = 2 muss dynamisch werden), dann werden alle Chunks zusammengeführt und im fertig-Folder abgelegt:
  if (request.body.part == 2) {
    let uploadPath = path.join(__dirname, "uploadFiles");
    fs.readdir(uploadPath, function (err, filenames) {
      if (err) return console.error("ERROR in fs.readdir(...): ", err);
      filenames.forEach(function (filename) {
        fs.stat(uploadPath + "/" + filename, (err, stats) => {
          if (err) return console.error("ERROR in fs.stat(...): ", err);
          if (stats.isFile()) {
            fs.readFile(uploadPath + "/" + filename, function (err, data) {
              if (err) return console.error("ERROR in fs.readFile(...): ", err);
              // appendFile erstellt Datei, wenn nicht vorhanden, unter dem gegebenen Pfad und Namen, und fügt Daten an,
              // Pfad (Folder) muss bereits vorhanden sein, sonst error
              fs.appendFile('./uploadFiles/fertig/dia druck.jpg', data, function (err) {
                if (err) return console.error("ERROR in fs.appendFile(...): ", err);
              });
            });
          };
        });
      });
    });
  }
  console.log('Multipart-Upload-Anfrage angekommen, hurra!');
  console.log(request.body, request.file);
  console.log("Part = ", request.body.part);
  response.json("Ich bin die Antwort vom Post-Request für den Multipart-Upload!");
})

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})

app.patch('/convertFile/:fileId', (req, res) => {
  const id = req.params['fileId'];
  exec('./PotreeConverter/build/PotreeConverter ./las/pointcloud_' + id
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
})

app.patch('/sendToS3/:fileId', (req, res) => {
  const id = req.params['fileId'];
  const filePath = './potree_output/pointcloud_' + id + '/hierarchy.bin';
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;
    const params = {
      Bucket: 'point-clouds',
      Key: 'potree_pointclouds/test/hierarchy123.bin',
      Body: JSON.stringify(data, null, 2)
    };
    s3.upload(params, function (s3Err, data) {
      if (s3Err) throw s3Err
      console.log(`File uploaded successfully at ${data.Location}`)
    });
  });
  res.send('sent to s3');
})

app.patch('/generateHTMLPage/:pointcloudId', (req, res) => {
  const id = req.params['pointcloudId'];
  exec('cp ./resources/template.html ./potree_pages/pointcloud_' + id + '.html', (error, stdout, stderr) => {
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

  fs.readFile('./resources/template.html', 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }
    var result = data.replace(/POINTCLOUD_NAME/g, 'pointcloud' + id);
    const params = {
      Bucket: 'point-clouds',
      Key: 'potree_pointclouds/test/pointcloud_test.html',
      Body: JSON.stringify(result, null, 2)
    };
    s3.upload(params, function (s3Err, data) {
      if (s3Err) throw s3Err
      console.log(`File uploaded successfully at ${data.Location}`)
    });
  });
  res.send('HTML page generated');
})
