// Shared by the vendor dashboard graph and the landing page graph:
// items sold per day for each packaging category, over the last 7 / 14 / 30 days.
const pool = require('./db');

const RANGES = [7, 14, 30];

// ?days=7|14|30 (anything else -> 7)
function rangeDays(query) {
  const n = Number(query.days);
  return RANGES.includes(n) ? n : 7;
}

// ['2026-10-09', ..., today] — n days, today included
function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

// rows: [{ day: 'YYYY-MM-DD', packaging_id, items }] -> one line per packaging category,
// with a value for every day (0 when nothing was sold).
async function packagingLines(rows, days) {
  const [packaging] = await pool.query('SELECT packaging_id, packaging_name FROM packaging_category ORDER BY packaging_id');
  return packaging.map((pk) => ({
    label: pk.packaging_name,
    values: days.map((day) => {
      const r = rows.find((x) => x.day === day && x.packaging_id === pk.packaging_id);
      return r ? Number(r.items) : 0;
    })
  }));
}

// The graph's headline + busiest-day marker, from the lines above.
// Categories with 0 items are skipped for most/least used; null when nothing was sold.
function graphSummary(lines, days) {
  const totals = lines.map((l) => ({ label: l.label, items: l.values.reduce((a, b) => a + b, 0) }));
  const used = totals.filter((t) => t.items > 0).sort((a, b) => b.items - a.items);
  const perDay = days.map((day, i) => ({ day, items: lines.reduce((a, l) => a + l.values[i], 0) }));
  const busiest = perDay.reduce((best, d) => (d.items > best.items ? d : best), { day: null, items: 0 });
  return {
    total: totals.reduce((a, t) => a + t.items, 0),
    most_used: used[0] || null,
    least_used: used.length > 1 ? used[used.length - 1] : null,
    busiest_day: busiest.day ? busiest : null
  };
}

// Week-over-week change in %, rounded; null when last week had nothing to compare with.
function changePct(thisWeek, lastWeek) {
  return lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
}

module.exports = { RANGES, rangeDays, lastDays, packagingLines, graphSummary, changePct };
