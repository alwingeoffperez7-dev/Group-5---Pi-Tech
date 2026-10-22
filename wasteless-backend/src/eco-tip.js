const pool = require("./db");

// Pure part (no database), so it can be tested on its own.
//   conds     rows of `conditions`
//   packaging [{ packaging_id, packaging_name, effects, tip_text }] (tip fields may be null)
//   rows      [{ wk, packaging_id, pieces }] pieces sold per week per packaging category
function evaluate(conds, packaging, rows) {
  const c = Object.fromEntries(conds.map((x) => [x.condition_code, x]));
  const weeks = Math.max(2, c.continuous ? c.continuous.threshold : 0);
  const totals = Array(weeks).fill(0);
  rows.forEach((r) => {
    if (r.wk >= 0 && r.wk < weeks) totals[r.wk] += Number(r.pieces);
  });
  const [total, previous] = totals;

  const breakdown = packaging.map((pk) => {
    const pieces = rows
      .filter((r) => r.wk === 0 && r.packaging_id === pk.packaging_id)
      .reduce((sum, r) => sum + Number(r.pieces), 0);
    return {
      packaging_id: pk.packaging_id,
      packaging_name: pk.packaging_name,
      pieces,
      percent: total ? Math.round((pieces / total) * 1000) / 10 : 0,
    };
  });

  const alerts = [];
  const overall = c.high_overall;
  const over = (n) => n >= overall.threshold;

  // Over the weekly limit: "continuous" (several weeks in a row) replaces the plain warning.
  if (
    overall &&
    c.continuous &&
    totals.slice(0, c.continuous.threshold).every(over)
  ) {
    alerts.push({
      code: "continuous",
      level: "high",
      tip: c.continuous.tip_text,
      title: `${c.continuous.condition_name}: over ${overall.threshold} pieces for ${c.continuous.threshold} weeks in a row`,
    });
  } else if (overall && over(total)) {
    alerts.push({
      code: "high_overall",
      level: "warning",
      tip: overall.tip_text,
      title: `${overall.condition_name}: ${total} pieces this week (limit ${overall.threshold})`,
    });
  }

  const share = c.category_share;
  if (share) {
    breakdown.forEach((b) => {
      if (
        b.pieces < share.min_pieces ||
        b.pieces * 100 < share.threshold * total
      )
        return;
      const pk = packaging.find((p) => p.packaging_id === b.packaging_id);
      alerts.push({
        code: "category_share",
        level: "warning",
        packaging_name: b.packaging_name,
        title: `${share.condition_name}: ${b.packaging_name} is ${b.percent}% of your plastic waste this week`,
        effects: String(pk.effects || "")
          .split("\n")
          .map((e) => e.trim())
          .filter(Boolean),
        tip: pk.tip_text || share.tip_text,
      });
    });
  }

  // Compared with last week (only when last week had enough pieces to compare)
  const change = previous
    ? Math.round(((total - previous) / previous) * 100)
    : 0;
  const comparable = (cond) =>
    cond && previous > 0 && previous >= cond.min_pieces;
  if (
    comparable(c.increase) &&
    total * 100 >= previous * (100 + c.increase.threshold)
  ) {
    alerts.push({
      code: "increase",
      level: "warning",
      tip: c.increase.tip_text,
      title: `${c.increase.condition_name}: up ${change}% from last week (${previous} → ${total} pieces)`,
    });
  }
  if (
    comparable(c.reduction) &&
    total * 100 <= previous * (100 - c.reduction.threshold)
  ) {
    alerts.push({
      code: "reduction",
      level: "positive",
      tip: c.reduction.tip_text,
      title: `${c.reduction.condition_name}: down ${-change}% from last week (${previous} → ${total} pieces)`,
    });
  }

  return {
    week_total: total,
    previous_week_total: previous,
    breakdown,
    alerts,
  };
}

async function ecoTips(canteenId) {
  const [conds] = await pool.query(
    "SELECT condition_code, condition_name, threshold, min_pieces, tip_text FROM conditions",
  );
  const continuous = conds.find((x) => x.condition_code === "continuous");
  const weeks = Math.max(2, continuous ? continuous.threshold : 0);
  const [packaging] = await pool.query(
    `SELECT pk.packaging_id, pk.packaging_name, t.effects, t.tip_text
     FROM packaging_category pk LEFT JOIN eco_tip t ON t.packaging_id = pk.packaging_id
     ORDER BY pk.packaging_id`,
  );
  const [rows] = await pool.query(
    `SELECT FLOOR(DATEDIFF(CURDATE(), DATE(s.sold_at)) / 7) AS wk, p.packaging_id,
            SUM(s.quantity_sold) AS pieces
     FROM sales_record s JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ? AND s.sold_at >= CURDATE() - INTERVAL ? DAY
       AND s.sold_at < CURDATE() + INTERVAL 1 DAY
     GROUP BY wk, p.packaging_id`,
    [canteenId, weeks * 7 - 1],
  );
  return evaluate(
    conds,
    packaging,
    rows.map((r) => ({ ...r, wk: Number(r.wk) })),
  );
}

module.exports = { evaluate, ecoTips };
