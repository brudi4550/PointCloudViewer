const express = require('express');
const app = express();
const port = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('index', {
    title: 'PointCloudViewer',
  })
})

app.listen(port, () => {
  console.log(`PointCloudViewer listening on port ${port}`)
})
