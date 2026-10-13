require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');
const { currentStall, wrap, errorHandler } = require('./middleware');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Main page lives in the repo root (index.html, script.js, style.css)
const root = path.join(__dirname, '..', '..');
app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.get(['/script.js', '/style.css'], (req, res) => res.sendFile(path.join(root, req.path)));

// Front-end files (js/api.js) and uploaded images
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API
app.use('/api', currentStall);
app.get('/api/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT category_id, category_name FROM category ORDER BY category_id');
  res.json(rows);
}));
app.use('/api/stall', require('./routes/stall'));
app.use('/api/products', require('./routes/products'));
app.use('/api/feedback', require('./routes/feedback'));

app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route' }));
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`WasteLess running at http://localhost:${port}`));
