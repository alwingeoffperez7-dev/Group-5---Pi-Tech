// Landing page "Data Summary" (public). Shapes match system.js/landing.js.
const express = require('express');
const pool = require('../db');
const { wrap } = require('../middleware');

const router = express.Router();

// GET /api/landing/chart   plastic waste (kg) per month, last 12 months
router.get('/chart', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(wastelog_date, '%b %Y') AS label, SUM(weight_kg) AS kg
     FROM wastelog
     WHERE wastelog_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(wastelog_date, '%Y-%m'), label
     ORDER BY DATE_FORMAT(wastelog_date, '%Y-%m')`
  );
  res.json({ yLabel: 'Plastic waste (kg)', labels: rows.map((r) => r.label), values: rows.map((r) => Number(r.kg)) });
}));

// GET /api/landing/summary
router.get('/summary', wrap(async (req, res) => {
  const [[w]] = await pool.query(
    `SELECT COALESCE(SUM(weight_kg), 0) AS total,
            COALESCE(SUM(CASE WHEN YEAR(wastelog_date) = YEAR(CURDATE()) THEN weight_kg END), 0) AS this_year,
            COALESCE(SUM(CASE WHEN YEAR(wastelog_date) = YEAR(CURDATE()) - 1 THEN weight_kg END), 0) AS last_year
     FROM wastelog`
  );
  const [[inv]] = await pool.query('SELECT COALESCE(SUM(stock), 0) AS items FROM product WHERE is_active = 1');
  const change = Number(w.this_year) - Number(w.last_year);
  res.json({
    title: 'Summary',
    items: [
      { label: 'Total plastic waste', value: `${Number(w.total)} kg` },
      { label: 'Items in inventory', value: String(inv.items) },
      { label: 'Change since last year', value: `${change >= 0 ? '+' : ''}${change} kg` }
    ]
  });
}));

module.exports = router;
