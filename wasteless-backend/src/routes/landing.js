// Landing page "Data Summary" (public). Shapes match system.js/landing.js.
const express = require('express');
const pool = require('../db');
const { wrap } = require('../middleware');
const { rangeDays, lastDays, packagingLines } = require('../packaging-graph');

const router = express.Router();

// GET /api/landing/chart?days=7|14|30   (default 7, today included)
// Items sold per day for each packaging category, ALL stalls. One line per packaging category.
router.get('/chart', wrap(async (req, res) => {
  const n = rangeDays(req.query);
  const [rows] = await pool.query(
    `SELECT DATE(s.sold_at) AS day, p.packaging_id, SUM(s.quantity_sold) AS items
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     WHERE c.status <> 'Removed' AND s.sold_at >= CURDATE() - INTERVAL ? DAY
     GROUP BY DATE(s.sold_at), p.packaging_id`,
    [n - 1]
  );
  const days = lastDays(n);
  res.json({
    yLabel: 'Items sold',
    labels: days.map((d) => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: await packagingLines(rows, days)
  });
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
