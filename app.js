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
const os = require('os');
const s3 = new AWS.S3({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})
const UPLOAD_STATUS_ENUM = {
  UNDEFINED: 'UNDEFINED',
  INITIALIZED: 'INITIALIZED',
  COMPLETE_ORDER_SENT: 'COMPLETE_ORDER_SENT',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ON_UPDATE: 'ON_UPDATE'
}

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
  GET: /pointcloud/:cloud_name
============================================================================*/
app.get('/pointcloud/:cloud_name', (request, response) => {
  dbService.getPointcloudEntryByCloudnameAndUsername(request.params.cloud_name, request.session.userid, function(err, result) {
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
});

/*============================================================================
  PUT: /multipart-upload/start-upload
============================================================================*/
app.put('/multipart-upload/start-upload', (request, response) => {
  const UPLOAD_FOLDER_PATH = path.join(__dirname, "las");
  let userID,
      cloudID;
  try {
    dbService.createPointCloudEntry(request.session.userid, request.body.cloud_name, 0, UPLOAD_STATUS_ENUM.INITIALIZED, function(err, id) {
      if (err) {
        return response
          .status(500)
          .json("creating pointcloud entry failed", err)
        } else { 
          cloudID = id; 
          dbService.getUserIdByName(request.session.userid, function(err, id) {
            if (err) {
              return response.status(500).send({error: err.message})
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
})

/*============================================================================
  PUT: /multipart-upload
============================================================================*/
// storage controls the server-side disk-storage of the incoming files
const STORAGE = multer.diskStorage({
  destination: function (request, file, callback) {
    dbService.getUserIdByName(request.session.userid, function(err, user_id) {
      if (err) {
        throw new Error(err.message);
      }
      callback(null, path.join(__dirname, "las", user_id.toString(), request.body.id));
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
  dbService.getUserIdByName(request.session.userid, function(err, user_id) {
    if (err) { throw new Error(err.message); }
    const UPLOAD_FOLDER_PATH = path.join(__dirname, "las", user_id.toString(), request.body.id);
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
    if (!convertFile()) {
      return response
        .status(500)
        .json("Multipart-Upload erfolgreich zusammengesetzt, aber beim Konvertieren von LAS zu ... ist ein Fehler aufgetreten.");
    }
    if (!uploadFileToAmazonS3()) {
      return response
        .status(500)
        .json("Multipart-Upload erfolgreich zusammengesetzt und konvertiert, aber beim Upload auf Amazon S3 ist ein Fehler aufgetreten.");
    }
    // FIXME: set db completed status to true
    // FIXME: delete local files
    return response
      .status(200)
      .json("Multipart-Upload erfolgreich zusammengesetzt, konvertiert und auf Amazon S3 geladen.");
  })

});

function mergeUploadedChunksIntoFinalFile(user_id, cloud_id) {
  try {
    const mergedFilename = cloud_id + ".las";
    const uploadFolderPath = path.join(__dirname, "las", user_id.toString(), cloud_id);
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

function convertFile() {
  console.log(os.type());
  return true;
}

function uploadFileToAmazonS3() {
  return true;
}

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})