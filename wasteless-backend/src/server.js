require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');
const { requireRole, wrap, errorHandler } = require('./middleware');

const app = express();
app.disable('x-powered-by'); // don't advertise "Express"

// Basic security headers on every response
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',          // browser must trust our Content-Type (no guessing)
    'X-Frame-Options': 'DENY',                    // page can't be put inside another site's frame
    'Referrer-Policy': 'same-origin',
    // Only load scripts/styles/images from this server (+ Chart.js from cdnjs).
    // 'unsafe-inline' is needed because the HTML pages use inline onclick handlers.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  });
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Front end (repo root): system.html/ system.js/ system.css/ from the front-end team.
// The old backend test page is still at /index.html.
const root = path.join(__dirname, '..', '..');
app.get('/', (req, res) => res.redirect('/system.html/landing.html'));
for (const dir of ['system.html', 'system.js', 'system.css']) {
  app.use(`/${dir}`, express.static(path.join(root, dir)));
}
app.get(['/index.html', '/script.js', '/style.css'], (req, res) => res.sendFile(path.join(root, req.path)));

// Shared API helper (js/api.js) and uploaded images
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Public API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/landing', require('./routes/landing'));
app.get('/api/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT category_id, category_name FROM category ORDER BY category_id');
  res.json(rows);
}));
app.get('/api/packaging', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT packaging_id, packaging_name, description, example FROM packaging_category ORDER BY packaging_id');
  res.json(rows);
}));

// Vendor API (acts on the logged-in vendor's own stall)
app.use('/api/stall/report', requireRole('vendor'), require('./routes/report'));
app.use('/api/stall', requireRole('vendor'), require('./routes/stall'));
app.use('/api/products', requireRole('vendor'), require('./routes/products'));
app.use('/api/feedback', requireRole('vendor'), require('./routes/feedback'));

// Admin API
app.use('/api/admin', requireRole('admin'), require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route' }));
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`WasteLess running at http://localhost:${port}`));
