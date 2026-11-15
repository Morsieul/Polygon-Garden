const express = require('express');
const app = express();
const path = require('path');

// Serve everything in the 'public' folder (HTML, CSS, JS)
app.use(express.static('.'));

// Or serve a specific HTML file for the home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => console.log('Server at http://localhost:3000'));