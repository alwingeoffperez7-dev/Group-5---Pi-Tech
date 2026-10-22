const test = require("node:test");
const assert = require("node:assert");
const { evaluate } = require("./eco-tip");

const conds = [
  {
    condition_code: "high_overall",
    condition_name: "High Plastic Waste",
    threshold: 90,
    tip_text: "overall",
  },
  {
    condition_code: "category_share",
    condition_name: "Top Plastic Categories",
    threshold: 20,
    tip_text: "generic",
  },
  {
    condition_code: "good_week",
    condition_name: "Good Work",
    threshold: null,
    tip_text: "congrats",
  },
];
const packaging = [
  {
    packaging_id: 1,
    packaging_name: "A",
    effects: "a1\na2",
    tip_text: "tip A",
  },
  { packaging_id: 2, packaging_name: "B", effects: "b1", tip_text: "tip B" },
  { packaging_id: 3, packaging_name: "C", effects: null, tip_text: null },
  { packaging_id: 4, packaging_name: "D", effects: "d1", tip_text: "tip D" },
  { packaging_id: 5, packaging_name: "E", effects: "e1", tip_text: "tip E" },
];
const sold = (...pieces) =>
  pieces
    .map((n, i) => ({ packaging_id: i + 1, pieces: n }))
    .filter((r) => r.pieces);
const names = (r) => r.categories.map((x) => x.packaging_name);

test("under the weekly limit: congratulate, no categories", () => {
  const r = evaluate(conds, packaging, sold(60, 29)); // 89 < 90, even though A is 67%
  assert.strictEqual(r.level, "positive");
  assert.strictEqual(r.tip, "congrats");
  assert.deepStrictEqual(r.categories, []);
});

test("no sales at all: congratulate", () => {
  const r = evaluate(conds, packaging, []);
  assert.strictEqual(r.level, "positive");
  assert.strictEqual(r.week_total, 0);
});

test("exactly at the limit counts as a warning", () => {
  const r = evaluate(conds, packaging, sold(90));
  assert.strictEqual(r.level, "warning");
  assert.deepStrictEqual(names(r), ["A"]);
});

test("only one category reaches 20%: only its effects", () => {
  const r = evaluate(conds, packaging, sold(85, 3, 2)); // A 94%, B 3%, C 2%
  assert.deepStrictEqual(names(r), ["A"]);
  assert.deepStrictEqual(r.categories[0].effects, ["a1", "a2"]);
  assert.strictEqual(r.categories[0].tip, "tip A");
});

test("exactly 20% counts", () => {
  const r = evaluate(conds, packaging, sold(80, 20)); // A 80%, B 20%
  assert.deepStrictEqual(names(r), ["A", "B"]);
  assert.strictEqual(r.categories[1].percent, 20);
});

test("four categories reach 20%: only the top 3, most pieces first", () => {
  const r = evaluate(conds, packaging, sold(21, 30, 24, 25)); // B 30, D 25, C 24, A 21
  assert.deepStrictEqual(names(r), ["B", "D", "C"]);
});

test("a category without its own tip uses the general tip", () => {
  const r = evaluate(conds, packaging, sold(0, 0, 100));
  assert.strictEqual(r.categories[0].tip, "generic");
  assert.deepStrictEqual(r.categories[0].effects, []);
});
