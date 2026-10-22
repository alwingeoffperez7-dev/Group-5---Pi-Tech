const test = require("node:test");
const assert = require("node:assert");
const { evaluate } = require("./eco-tip");

const conds = [
  {
    condition_code: "high_overall",
    condition_name: "High Overall Waste",
    threshold: 90,
    min_pieces: 0,
    tip_text: "overall",
  },
  {
    condition_code: "category_share",
    condition_name: "High Category Share",
    threshold: 40,
    min_pieces: 20,
    tip_text: "generic",
  },
  {
    condition_code: "increase",
    condition_name: "Increasing Plastic Waste",
    threshold: 10,
    min_pieces: 20,
    tip_text: "up",
  },
  {
    condition_code: "continuous",
    condition_name: "Continuous High Usage",
    threshold: 2,
    min_pieces: 0,
    tip_text: "cont",
  },
  {
    condition_code: "reduction",
    condition_name: "Reduction Observed",
    threshold: 10,
    min_pieces: 20,
    tip_text: "down",
  },
];
const packaging = [
  {
    packaging_id: 1,
    packaging_name: "Tetra Pak",
    effects: "A\nB",
    tip_text: "dispenser",
  },
  { packaging_id: 2, packaging_name: "Wrapper", effects: null, tip_text: null },
];
const codes = (r) => r.alerts.map((a) => a.code);

test("quiet week: no alerts", () => {
  // 50% each, but only 15 pieces each (< 20), same total as last week
  const r = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 15 },
    { wk: 0, packaging_id: 2, pieces: 15 },
    { wk: 1, packaging_id: 1, pieces: 30 },
  ]);
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.week_total, 30);
});

test("category share needs 40% AND 20 pieces", () => {
  const r = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 20 },
    { wk: 0, packaging_id: 2, pieces: 30 },
    { wk: 1, packaging_id: 1, pieces: 50 },
  ]);
  // 20/50 = 40% (counts, exactly at threshold), 30/50 = 60%
  assert.deepStrictEqual(codes(r), ["category_share", "category_share"]);
  assert.deepStrictEqual(r.alerts[0].effects, ["A", "B"]);
  assert.strictEqual(r.alerts[1].tip, "generic"); // no tip for that category -> generic tip
  assert.strictEqual(r.breakdown[0].percent, 40);
});

test("over the limit this week only -> high_overall; two weeks -> continuous instead", () => {
  const once = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 45 },
    { wk: 0, packaging_id: 2, pieces: 45 },
    { wk: 1, packaging_id: 1, pieces: 85 },
  ]);
  assert.deepStrictEqual(
    codes(once).filter((c) => c !== "category_share"),
    ["high_overall"],
  );
  const twice = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 90 },
    { wk: 1, packaging_id: 1, pieces: 95 },
  ]);
  assert.deepStrictEqual(
    codes(twice).filter((c) => c !== "category_share"),
    ["continuous"],
  );
});

test("increase / reduction compare with last week (needs 20+ pieces last week)", () => {
  const up = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 11 },
    { wk: 0, packaging_id: 2, pieces: 11 },
    { wk: 1, packaging_id: 1, pieces: 20 },
  ]);
  assert.deepStrictEqual(codes(up), ["increase"]); // 22 vs 20 = +10%
  const down = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 9 },
    { wk: 0, packaging_id: 2, pieces: 9 },
    { wk: 1, packaging_id: 1, pieces: 20 },
  ]);
  assert.deepStrictEqual(codes(down), ["reduction"]); // 18 vs 20 = -10%
  assert.strictEqual(down.alerts[0].level, "positive");
  const tooSmall = evaluate(conds, packaging, [
    { wk: 0, packaging_id: 1, pieces: 5 },
    { wk: 1, packaging_id: 1, pieces: 19 },
  ]);
  assert.deepStrictEqual(codes(tooSmall), []);
});

test("no sales at all", () => {
  const r = evaluate(conds, packaging, []);
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.breakdown[0].percent, 0);
});
