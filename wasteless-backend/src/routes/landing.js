// Landing page "Data Summary" (public). Shapes match system.js/landing.js.
const express = require('express');
const pool = require('../db');
const { wrap } = require('../middleware');
const { rangeDays, lastDays, packagingLines, graphSummary, changePct } = require('../packaging-graph');

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
  const datasets = await packagingLines(rows, days);
  res.json({
    yLabel: 'Items sold',
    labels: days.map((d) => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets,
    summary: graphSummary(datasets, days)
  });
}));

// GET /api/landing/summary
router.get('/summary', wrap(async (req, res) => {
  const [[w]] = await pool.query('SELECT COALESCE(SUM(weight_kg), 0) AS total FROM wastelog');
  const [[inv]] = await pool.query('SELECT COALESCE(SUM(stock), 0) AS items FROM product WHERE is_active = 1');
  // Approved stalls under the weekly plastic limit (same limit + 7 days as the Eco-Tip)
  const [[st]] = await pool.query(
    `SELECT COUNT(*) AS stalls,
            COALESCE(SUM(t.pieces < (SELECT threshold FROM conditions WHERE condition_code = 'high_overall')), 0) AS under_limit
     FROM (SELECT c.canteen_id, COALESCE(SUM(s.quantity_sold), 0) AS pieces
           FROM canteen c
           LEFT JOIN product p ON p.canteen_id = c.canteen_id
           LEFT JOIN sales_record s ON s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
           WHERE c.status = 'Approved'
           GROUP BY c.canteen_id) t`
  );
  // Hero card: plastic items sold in the last 7 days vs the 7 days before, all stalls
  const [[wk]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN s.sold_at >= CURDATE() - INTERVAL 6 DAY THEN s.quantity_sold END), 0) AS this_week,
            COALESCE(SUM(CASE WHEN s.sold_at < CURDATE() - INTERVAL 6 DAY THEN s.quantity_sold END), 0) AS last_week
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     WHERE c.status <> 'Removed' AND s.sold_at >= CURDATE() - INTERVAL 13 DAY`
  );
  const thisWeek = Number(wk.this_week), lastWeek = Number(wk.last_week);
  res.json({
    week: { this_week: thisWeek, last_week: lastWeek, change_pct: changePct(thisWeek, lastWeek) },
    title: 'Summary',
    // The small cards beside the hero card, in this order
    items: [
      { label: 'Stalls under the limit', value: `${Number(st.under_limit)} of ${Number(st.stalls)}`, note: 'Under the weekly plastic limit' },
      { label: 'Items in inventory', value: String(inv.items), note: `Across ${Number(st.stalls)} active stalls` },
      { label: 'Total plastic waste', value: `${Number(w.total)} kg`, note: 'All time, from the waste logs' }
    ]
  });
}));

module.exports = router;
