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

module.exports = { RANGES, rangeDays, lastDays, packagingLines };
