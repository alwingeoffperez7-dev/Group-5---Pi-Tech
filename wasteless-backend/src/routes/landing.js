// Landing page "Data Summary" (public). Shapes match system.js/landing.js.
const express = require('express');
const pool = require('../db');
const { wrap } = require('../middleware');

const router = express.Router();

// GET /api/landing/chart   items sold per month for each packaging category, ALL stalls,
// last 12 months (this month included). One line per packaging category.
router.get('/chart', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(s.sold_at, '%Y-%m') AS month, p.packaging_id, SUM(s.quantity_sold) AS items
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     WHERE c.status <> 'Removed'
       AND s.sold_at >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH, '%Y-%m-01')
     GROUP BY month, p.packaging_id`
  );
  const [packaging] = await pool.query('SELECT packaging_id, packaging_name FROM packaging_category ORDER BY packaging_id');

  // Every month gets a value, so months with no sales show as 0
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d);
  }
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const datasets = packaging.map((pk) => ({
    label: pk.packaging_name,
    values: months.map((d) => {
      const r = rows.find((x) => x.month === key(d) && x.packaging_id === pk.packaging_id);
      return r ? Number(r.items) : 0;
    })
  }));

  res.json({
    yLabel: 'Items sold',
    labels: months.map((d) => d.toLocaleString('en-US', { month: 'short', year: 'numeric' })),
    datasets
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
