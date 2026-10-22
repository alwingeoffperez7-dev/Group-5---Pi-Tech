const pool = require("./db");

const MAX_CATEGORIES = 3; // show the effects of at most the 3 categories with the most pieces

// Pure part (no database), so it can be tested on its own.
//   conds     rows of `conditions`
//   packaging [{ packaging_id, packaging_name, effects, tip_text }] (tip fields may be null)
//   rows      [{ packaging_id, pieces }] pieces sold this week per packaging category
function evaluate(conds, packaging, rows) {
  const c = Object.fromEntries(conds.map((x) => [x.condition_code, x]));
  const total = rows.reduce((sum, r) => sum + Number(r.pieces), 0);
  const limit = c.high_overall.threshold;

  if (total < limit) {
    return {
      week_total: total,
      limit,
      level: "positive",
      title: `${c.good_week.condition_name}: ${total} pieces this week (limit ${limit})`,
      tip: c.good_week.tip_text,
      categories: [],
    };
  }

  const share = c.category_share.threshold;
  const categories = packaging
    .map((pk) => {
      const pieces = rows
        .filter((r) => r.packaging_id === pk.packaging_id)
        .reduce((sum, r) => sum + Number(r.pieces), 0);
      return {
        packaging_name: pk.packaging_name,
        pieces,
        percent: Math.round((pieces / total) * 1000) / 10,
        effects: String(pk.effects || "")
          .split("\n")
          .map((e) => e.trim())
          .filter(Boolean),
        tip: pk.tip_text || c.category_share.tip_text,
      };
    })
    .filter((x) => x.pieces * 100 >= share * total) // whole numbers, so exactly 20% counts
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, MAX_CATEGORIES);

  return {
    week_total: total,
    limit,
    level: "warning",
    title: `${c.high_overall.condition_name}: ${total} pieces this week (limit ${limit})`,
    tip: c.high_overall.tip_text,
    categories,
  };
}

async function ecoTips(canteenId) {
  const [conds] = await pool.query(
    "SELECT condition_code, condition_name, threshold, tip_text FROM conditions",
  );
  const [packaging] = await pool.query(
    `SELECT pk.packaging_id, pk.packaging_name, t.effects, t.tip_text
     FROM packaging_category pk LEFT JOIN eco_tip t ON t.packaging_id = pk.packaging_id
     ORDER BY pk.packaging_id`,
  );
  const [rows] = await pool.query(
    `SELECT p.packaging_id, SUM(s.quantity_sold) AS pieces
     FROM sales_record s JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ? AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
       AND s.sold_at < CURDATE() + INTERVAL 1 DAY
     GROUP BY p.packaging_id`,
    [canteenId],
  );
  return evaluate(conds, packaging, rows);
}

module.exports = { evaluate, ecoTips };
