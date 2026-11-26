// Shifts older demo-stall sales forward so the latest demo sales land on today.
// Run: npm run demo:refresh  (inside wasteless-backend, with MySQL running)
require("dotenv").config();
const pool = require("./db");

const DEMO_EMAILS = ["rosa@demo.local", "bea@demo.local", "kape@demo.local"];

async function main() {
  const [[recent]] = await pool.query(
    `SELECT COUNT(*) AS week_rows
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     WHERE c.business_email IN (?, ?, ?)
       AND s.sold_at >= CURDATE() - INTERVAL 6 DAY`,
    DEMO_EMAILS,
  );

  if (Number(recent.week_rows) >= 20) {
    console.log(`Demo sales already cover this week (${recent.week_rows} sales in the last 7 days).`);
    return;
  }

  const [[row]] = await pool.query(
    `SELECT MAX(DATE(s.sold_at)) AS last_day,
            DATEDIFF(CURDATE(), MAX(DATE(s.sold_at))) AS shift_days,
            COUNT(*) AS old_rows
     FROM sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     WHERE c.business_email IN (?, ?, ?)
       AND s.sold_at < CURDATE() - INTERVAL 6 DAY`,
    DEMO_EMAILS,
  );

  if (!row || !row.old_rows) {
    console.log("No demo sales found. Load database/demo-data.sql first.");
    return;
  }

  const shift = Number(row.shift_days || 0);
  if (shift <= 0) {
    console.log("Demo sales are already up to date.");
    return;
  }

  const [res] = await pool.query(
    `UPDATE sales_record s
     JOIN product p ON p.product_id = s.product_id
     JOIN canteen c ON c.canteen_id = p.canteen_id
     SET s.sold_at = s.sold_at + INTERVAL ? DAY
     WHERE c.business_email IN (?, ?, ?)
       AND s.sold_at < CURDATE() - INTERVAL 6 DAY`,
    [shift, ...DEMO_EMAILS],
  );
  console.log(`Shifted ${res.affectedRows} demo sales forward by ${shift} day(s) (now ending today).`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
