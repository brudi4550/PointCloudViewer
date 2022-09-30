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

/*============================================================================
  POST: /multipart-upload
============================================================================*/
app.post('/multipart-upload', (request, response) => {
  let uploadFolderPath,
      uploadID; 
  
  try {
    uploadFolderPath = path.join(__dirname, "uploadFiles");
    // uploadID = fs.readdirSync(uploadFolderPath).length; // FIXME: ID aus der Datenbank lesen
    dbService.getNextUploadIDByUser(request.session.userid, "", function(err, id) {
      if (err) {
        return response
          .status(500)
          .send("generating upload id failed", uploadID)
      } else {
        uploadID = id;
        // create directory for the planned upload 
        fs.mkdir(path.join(uploadFolderPath, uploadID.toString()), 
        { recursive: true }, (err) => {
          if (err) {
            return response
              .status(500)
              .send("creating directory for the planned upload failed: ", err)
          }
        });

        return response
          .status(201)
          .location("/multipart-upload/" + uploadID.toString())
          .send({
            id: uploadID,
            chunkSizeInBit: 1024 * 1024 / 2,
            uploadCompleted: false
          })
      }
    });

  } catch (err) {
    return response
      .status(500)
      .send("Unbekannter Fehler", err)
  }
})

/*============================================================================
  PUT: /multipart-upload/:id
============================================================================*/
// storage controls the server-side disk-storage of the incoming files
const STORAGE = multer.diskStorage({
  destination: function (request, file, callback) {
    callback(null, "./uploadFiles/" + request.body.id);
  },
  filename: function (request, file, callback) {
    callback(null, file.originalname + request.body.part);
  },
});
const UPLOAD = multer({ storage: STORAGE });

app.put('/multipart-upload/:id', UPLOAD.single("fileToUpload"), (request, response) => { 
  // uploaded binary data already saved at this point
  return response
    .status(200)
    .json("Multipart-Upload erfolgreich.");
});

/*============================================================================
  POST: /multipart-upload/:id/completeUpload
============================================================================*/
app.post('/multipart-upload/:id/completeUpload', (request, response) => {
  if (!mergeUploadedChunksIntoFinalFile(request.params.id)) {
    return response
      .status(500)
      .json("Das Zusammensetzen der Upload-Teile hat nicht funktioniert.");
  }
  if (!convertFile(request.params.id)) {
    return response
      .status(500)
      .json("Multipart-Upload erfolgreich zusammengesetzt, aber beim Konvertieren von LAS zu ... ist ein Fehler aufgetreten.");
  }
  if (!uploadFileToAmazonS3(request.params.id)) {
    return response
      .status(500)
      .json("Multipart-Upload erfolgreich zusammengesetzt und konvertiert, aber beim Upload auf Amazon S3 ist ein Fehler aufgetreten.");
  }
  // FIXME: set db completed status to true
  // FIXME: delete local files
  return response
    .status(200)
    .json("Multipart-Upload erfolgreich zusammengesetzt, konvertiert und auf Amazon S3 geladen.");
});

function mergeUploadedChunksIntoFinalFile(id) {
  try {
    const mergedFilename = "Dateiname.jpg"; // FIXME: read from database
    const uploadFolderPath = path.join(__dirname, "uploadFiles", id); // FIXME: different directory ... maybe username/{uploadId}
    // delete merged file if exists (necessary if an error has occurred previously)
    if (fs.existsSync(path.join(uploadFolderPath, mergedFilename))) {
      fs.unlinkSync(path.join(uploadFolderPath, mergedFilename));
    }
    // read each chunk and merge it into final file
    fs.readdir(uploadFolderPath, function (err, filenames) {
      if (err) return false;
      filenames // chunks are numbered, but stored without leading zeros; therefore they must first be sorted
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .forEach(function (chunkFilename) {
          if (fs.statSync(path.join(uploadFolderPath, chunkFilename)).isFile()) {
            const data = fs.readFileSync(path.join(uploadFolderPath, chunkFilename));
            fs.appendFileSync(path.join(uploadFolderPath, mergedFilename), data);
          };
      });
    });
  } catch (error) {
    return false;  
  }
  return true;
}

function convertFile(id) {
  return true;
}

function uploadFileToAmazonS3(id) {
  return true;
}

//server start
//============================================================================
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
