const express = require('express');
const multer = require('multer');
const sessions = require('express-session');
const dotenv = require('dotenv').config();
const app = express();
const busboy = require('connect-busboy');   // Middleware to handle the file upload https://github.com/mscdex/connect-busboy
const path = require('path');               // Used for manipulation with path
const fs = require('fs-extra');             // Classic fs
const port = 3000;
const { exec, execFile } = require("child_process");
const { stderr } = require('process');
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
  console.log(session);
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
      if (result.length > 0) {
        function callback(error, result) {
          req.session.userid = req.body.username;
          res.session = req.session;
          res.status(200).redirect('/');
        }
        dbService.createSession(req.body.username, Date.now(), callback)
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

/*============================================================================
  POST: /multipart-upload
============================================================================*/
app.post('/multipart-upload', (request, response) => {
  let uploadFolderPath = path.join(__dirname, "uploadFiles");
  let uploadID = fs.readdirSync(uploadFolderPath).length; // TODO: ID aus der Datenbank lesen

  // create directories for the planned upload 
  fs.mkdir(path.join(uploadFolderPath, uploadID.toString()), 
  { recursive: true }, (err) => {
    if (err) return console.error("ERROR in fs.mkdir(...): ", err);
  });
  fs.mkdir(path.join(uploadFolderPath, uploadID.toString(), "completeFiles"), 
  { recursive: true }, (err) => {
    if (err) return console.error("ERROR in fs.mkdir(...): ", err);
  });

  return response
    .status(201)
    .location("/multipart-upload/" + uploadID.toString())
    .send({
      id: uploadID,
      chunkSizeInBit: 1024 * 1024 / 2,
      uploadCompleted: false
    })
})

/*============================================================================
  PUT: /multipart-upload/:id
============================================================================*/
// storage controls the server-side disk-storage of the incoming files
const storage = multer.diskStorage({
  destination: function (request, file, callback) {
    callback(null, "./uploadFiles/" + request.body.id);
  },
  filename: function (request, file, callback) {
    callback(null, file.originalname + request.body.part);
  },
});
const upload = multer({ storage: storage });
app.put('/multipart-upload/:id', upload.single("fileToUpload"), (request, response) => {
  let uploadFolderPath = path.join(__dirname, "uploadFiles", request.params.id);
  if (1 == 1) { // TODO: Anhängen in die Finaldatei immer, oder erst, wenn fertig?
    // Lese sämtliche Daten im direkten Upload-Verzeichnis der jeweiligen Punktwolke aus
    fs.readdir(uploadFolderPath, function (err, filenames) { 
      if (err) return console.error("ERROR in fs.readdir(...): ", err); 
      filenames.forEach(function (filename) {
        // Wenn es sich um eine Datei handelt (nicht um einen Folder),
        // dann handelt es sich um einen Chunk,
        // und dieser Chunk wird in die Final-Datei angehängt.
        fs.stat(uploadFolderPath + "/" + filename, (err, stats) => {
          if (err) return console.error("ERROR in fs.stat(...): ", err); 
          if (stats.isFile()) {
            fs.readFile(uploadFolderPath + "/" + filename, function(err, data) { 
              if (err) return console.error("ERROR in fs.readFile(...): ", err); 
              // appendFile erstellt Datei, wenn nicht vorhanden, unter dem gegebenen Pfad und Namen, und fügt Daten an,
              // Pfad (Folder) muss bereits vorhanden sein, sonst error
              fs.appendFile(uploadFolderPath + "/" + "Dateiname.jpg", data, function (err) { // TODO: den urpsrünglichen Dateinamen einfügen
                if (err) return console.error("ERROR in fs.appendFile(...): ", err);
              });  
            });
          }; 
        });
      });
    });
    return response.status(218).json("yay");
  }
});

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})
