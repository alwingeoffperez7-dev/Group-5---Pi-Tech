// My Stall page + the header (Stall ID / Stall Name) on every page.
const express = require('express');
const pool = require('../db');
const { HttpError, wrap } = require('../middleware');

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
     WHERE p.canteen_id = ? AND p.packaging_type = 'Plastic'
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

// GET /api/stall/dashboard   last 7 days (today included):
//   revenue_total  -> "Sales & Revenue" card
//   packaging      -> items sold per day for each packaging type (the packaging line graph)
router.get('/dashboard', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(s.sold_at) AS day, p.packaging_type,
            SUM(s.quantity_sold) AS items, SUM(s.quantity_sold * s.unit_price) AS revenue
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ? AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
     GROUP BY DATE(s.sold_at), p.packaging_type`,
    [req.canteenId]
  );

  // Every day gets a value, so days with no sales show as 0 on the graph
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const packaging = {};
  for (const type of ['Plastic', 'Paper', 'Reusable']) {
    packaging[type] = days.map((day) => {
      const r = rows.find((x) => x.day === day && x.packaging_type === type);
      return r ? Number(r.items) : 0;
    });
  }
  const revenueTotal = rows.reduce((sum, r) => sum + Number(r.revenue), 0);
  res.json({ labels: days, packaging, revenue_total: revenueTotal });
}));

module.exports = router;
