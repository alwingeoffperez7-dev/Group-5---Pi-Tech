// My Stall page + the header (Stall ID / Stall Name) on every page.
const express = require('express');
const pool = require('../db');
const { HttpError, wrap } = require('../middleware');
const { rangeDays, lastDays, packagingLines } = require('../packaging-graph');
const { ecoTips } = require('../eco-tip');

const router = express.Router();

// GET /api/stall
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT canteen_id AS stall_id, business_name AS stall_name, business_email,
            contact_person, contact_email, contact_number, location, joined_date
     FROM canteen WHERE canteen_id = ?`,
    [req.canteenId]
  );
  if (!rows[0]) throw new HttpError(404, 'Stall not found');

  // The three summary cards
  const [[counts]] = await pool.query(
    `SELECT COUNT(*) AS products_listed,
            COALESCE(SUM(stock <= reorder_threshold), 0) AS low_stock_items
     FROM product WHERE canteen_id = ? AND is_active = 1`,
    [req.canteenId]
  );
  const [[plastic]] = await pool.query(
    `SELECT COALESCE(SUM(s.quantity_sold), 0) AS plastic_items_sold_this_week
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ?
       AND YEARWEEK(s.sold_at, 1) = YEARWEEK(CURDATE(), 1)`,
    [req.canteenId]
  );

  res.json({
    ...rows[0],
    summary: {
      products_listed: Number(counts.products_listed),
      low_stock_items: Number(counts.low_stock_items),
      plastic_items_sold_this_week: Number(plastic.plastic_items_sold_this_week)
    }
  });
}));

// GET /api/stall/dashboard?days=7|14|30   (default 7, today included)
//   lines         -> items sold per day for each packaging category (the packaging line graph)
router.get('/dashboard', wrap(async (req, res) => {
  const n = rangeDays(req.query);
  const [rows] = await pool.query(
    `SELECT DATE(s.sold_at) AS day, p.packaging_id,
            SUM(s.quantity_sold) AS items
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ? AND s.sold_at >= CURDATE() - INTERVAL ? DAY
     GROUP BY DATE(s.sold_at), p.packaging_id`,
    [req.canteenId, n - 1]
  );
  const days = lastDays(n);
  res.json({
    days: n,
    labels: days,
    lines: await packagingLines(rows, days)
  });
}));

// GET /api/stall/eco-tips -> this week's plastic waste + the Eco-Tip alerts that apply
//   { week_total, previous_week_total, breakdown: [{ packaging_name, pieces, percent }],
//     alerts: [{ code, level: 'high'|'warning'|'positive', title, tip, effects? }] }
router.get('/eco-tips', wrap(async (req, res) => {
  res.json(await ecoTips(req.canteenId));
}));

module.exports = router;
