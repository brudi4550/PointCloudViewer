const express = require('express');
const app = express();
const busboy = require('connect-busboy');   // Middleware to handle the file upload https://github.com/mscdex/connect-busboy
const path = require('path');               // Used for manipulation with path
const fs = require('fs-extra');             // Classic fs
const port = 3000;
const { exec, execFile } = require("child_process");
const { stderr } = require('process');
const path_to_las = 'C:/Users/Asus/OneDrive/Desktop/Uni/SS2022/IT_Projekt/PointCloudViewer/';
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
  // List is hardcoded now will be Get request to bucket later
  let cloud1 = {
    name: 'Cloud 1',
    url: 'http://test.at'
  }
  let cloud2 = {
    name: 'Cloud 2',
    url: 'http://test.at'
  }
  let clouds = [cloud1, cloud2]
  res.render('index', {
    clouds: clouds,
    title: 'PointCloudViewer',
  })
})

app.get('/fileconvert', (req, res) => {
  res.render('fileconvert', {
    title: 'PointCloudViewer',
  })
})

app.post('/fileconvert', (req, res) => {
  console.log('Converting the file has started');
  const path = 'C:/Users/Asus/OneDrive/Desktop/Uni/SS2022/IT_Projekt/PointCloudViewer/';

  exec(path+'PotreeConverter/PotreeConverter.exe '+path+'fu/test_punkt_wolke.las -o '+path+'fu/test -generate-page testpage', (error, stdout, stderr) => {
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

app.route('/upload').post(async (req, res, next) => {
    console.log('received post request');
    var awaitUpload = new Promise(function(resolve, reject) {
      try{
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
      }catch(error){
        reject(error)
      }
    })
    awaitUpload.then(resolve => {
      convertFilePromise(resolve).then(resolve2  => {
        console.log('Request has been returned')
        res.redirect('back')
      })
    });
});

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})

function convertFilePromise(filename){
  console.log(`Converting the file ${filename} has started`);
  const path_local = 'C:/Users/Asus/OneDrive/Desktop/Uni/SS2022/IT_Projekt/PointCloudViewer/';
  return new Promise(function(resolve, reject) {
    exec(`${path_local}PotreeConverter/PotreeConverter.exe ${path_local}fu/${filename} -o ${path_local}/fu/test -generate-page testpage`, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        reject(error)
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        reject(stderr)
        return;
      }
      console.log(`stdout: ${stdout}`);
      resolve('success')
    });
  });
}