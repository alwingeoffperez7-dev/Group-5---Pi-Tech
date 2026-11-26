// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { graphSummary, changePct } = require('./packaging-graph');

test('graph headline: most/least used and busiest day', () => {
  const days = ['2026-11-25', '2026-11-26', '2026-11-27'];
  const lines = [
    { label: 'Tetra Pak', values: [1, 2, 0] },
    { label: 'Polystyrene (PS)', values: [3, 5, 4] },
    { label: 'Plastic Lid / Cap', values: [0, 0, 0] }
  ];
  const s = graphSummary(lines, days);
  assert.strictEqual(s.total, 15);
  assert.deepStrictEqual(s.most_used, { label: 'Polystyrene (PS)', items: 12 });
  assert.deepStrictEqual(s.least_used, { label: 'Tetra Pak', items: 3 }); // 0-item categories skipped
  assert.deepStrictEqual(s.busiest_day, { day: '2026-11-26', items: 7 });
});

test('graph headline with no sales is empty, not wrong', () => {
  const s = graphSummary([{ label: 'Tetra Pak', values: [0, 0] }], ['a', 'b']);
  assert.deepStrictEqual(s, { total: 0, most_used: null, least_used: null, busiest_day: null });
});

test('week-over-week change', () => {
  assert.strictEqual(changePct(548, 623), -12);
  assert.strictEqual(changePct(10, 0), null);
});
