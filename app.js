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
    uploadID = fs.readdirSync(uploadFolderPath).length; // FIXME: ID aus der Datenbank lesen

    // create directory for the planned upload 
    fs.mkdir(path.join(uploadFolderPath, uploadID.toString()),
      { recursive: true }, (err) => {
        if (err) return console.error("ERROR in fs.mkdir(...): ", err);
      });
    // fs.mkdir(path.join(uploadFolderPath, uploadID.toString(), "completeFiles"), 
    // { recursive: true }, (err) => {
    //   if (err) return console.error("ERROR in fs.mkdir(...): ", err);
    // });

    return response
      .status(201)
      .location("/multipart-upload/" + uploadID.toString())
      .send({
        id: uploadID,
        chunkSizeInBit: 1024 * 1024 / 2,
        uploadCompleted: false
      })
  } catch (err) {
    return response
      .status(500)
      .send(err)
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
  if (!applyUploadedChunksToFinalFile(request.params.id)) {
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

function applyUploadedChunksToFinalFile(id) {
  // FIXME: DELETE FINAL FILE IF EXISTS
  let uploadFolderPath = path.join(__dirname, "uploadFiles", id);
  // Lese sämtliche Daten im direkten Upload-Verzeichnis der jeweiligen Punktwolke aus
  fs.readdir(uploadFolderPath, function (err, filenames) {
    if (err) return false;
    filenames.forEach(function (filename) {
      // Wenn es sich um eine Datei handelt (nicht um einen Folder),
      // dann handelt es sich um einen Chunk,
      // und dieser Chunk wird in die Final-Datei angehängt.
      fs.stat(uploadFolderPath + "/" + filename, (err, stats) => {
        if (err) return false;
        if (stats.isFile()) {
          fs.readFile(uploadFolderPath + "/" + filename, function (err, data) {
            if (err) return false;
            // appendFile erstellt Datei, wenn nicht vorhanden, unter dem gegebenen Pfad und Namen, und fügt Daten an,
            // Pfad (Folder) muss bereits vorhanden sein, sonst error
            fs.appendFile(uploadFolderPath + "/" + "Dateiname.jpg", data, function (err) { // FIXME: den urpsrünglichen Dateinamen einfügen
              if (err) return false;
            });
          });
        };
      });
    });
  });
  return true;
}

function convertFile(id) {
  return true;
}

function uploadFileToAmazonS3(id) {
  return true;
}

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})