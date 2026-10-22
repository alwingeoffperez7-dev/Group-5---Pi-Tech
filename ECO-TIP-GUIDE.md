# Eco-Tip: Guide for the Backend Team (version 2)

**Version 2 (2026-10-22)** follows the team's changes:

- Effects are picked from the **top 3** plastic categories.
- The share threshold is **20%**, because there are 5 categories.
- Stalls are **congratulated** when they are doing well.
- The pop-up is a **`<div>`** with no summary chart for now.

You already built version 1 (Steps 1–12 of the old guide, branch `eco-tip`). **This guide changes that code to version 2.** Every code block below has been run and tested: follow it word for word and you get the tested version.

- Read [Part A](#part-a-the-rules) first, so you can explain the rules.
- [Part B](#part-b-steps) is the step-by-step changes.
- [Why the rules look like this](#why-the-rules-look-like-this) explains one important fix to the team's idea.

**Contents**

- [Part A: The rules](#part-a-the-rules)
- [Part B: Steps](#part-b-steps)
  - [Step 0: Get ready](#step-0-get-ready)
  - [Step 1: schema.sql](#step-1-schemasql)
  - [Step 2: seed.sql](#step-2-seedsql)
  - [Step 3: Migration (and run it)](#step-3-migration-and-run-it)
  - [Step 4: The rule logic (eco-tip.js)](#step-4-the-rule-logic-eco-tipjs)
  - [Step 5: Tests](#step-5-tests)
  - [Step 6: Admin routes](#step-6-admin-routes)
  - [Step 7: Vendor page HTML](#step-7-vendor-page-html)
  - [Step 8: Vendor page script](#step-8-vendor-page-script)
  - [Step 9: Admin page HTML](#step-9-admin-page-html)
  - [Step 10: Admin page script](#step-10-admin-page-script)
  - [Step 11: Test everything](#step-11-test-everything)
  - [Step 12: Docs, commit and pull request](#step-12-docs-commit-and-pull-request)
- [Why the rules look like this](#why-the-rules-look-like-this)

---

# Part A: The rules

| Term          | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| **Piece**     | 1 item sold = 1 piece of plastic waste, counted under the product's packaging category. |
| **This week** | The last 7 days, today included.                                                        |
| **Share**     | A category's pieces this week ÷ the stall's total pieces this week × 100.               |

Every time a vendor opens the **Dashboard**, the server checks that stall's pieces for this week:

| Situation                                | What the vendor sees                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Total **≥ 90 pieces** (the weekly limit) | **Warning pop-up** (a `<div>`): "WARNING: High Plastic Waste: 97 pieces this week (limit 90)", a general tip, then the **effects + tip of every category with a share ≥ 20%**, at most the **top 3** (most pieces first). If only 1 category reaches 20%, only its effects are shown. The banner says the stall is over the limit and has a "View Eco-Tip" button. |
| Total **under 90**                       | **No pop-up.** The banner **congratulates** the vendor: "Good Work: 75 pieces this week (limit 90). Great job! …"                                                                                                                                                                                                                                                  |

- The pop-up opens on **every** dashboard visit while the stall is over the limit. "Got it" or **Esc** closes it.
- The admin can change the **90**, the **20%** and all the texts in the **Eco-Tips** tab. The effects and tips per category are the same as in version 1.

**Example** (a stall's week): Plastic Container 52, Polystyrene 20, Plastic Lid / Cap 17, Plastic Wrapper 8 = **97 pieces** (over 90).
Shares: Container 53.6% ✔, Polystyrene 20.6% ✔, Lid / Cap 17.5% ✘, Wrapper 8.2% ✘ → the pop-up shows **Container and Polystyrene** only.

**The database rows** (`conditions` table, version 2):

| code             | name                   | threshold          | used for                                             |
| ---------------- | ---------------------- | ------------------ | ---------------------------------------------------- |
| `high_overall`   | High Plastic Waste     | 90 (pieces / week) | warning when this week ≥ it                          |
| `category_share` | Top Plastic Categories | 20 (% of the week) | which categories' effects to show (top 3)            |
| `good_week`      | Good Work              | _(none)_           | the congratulation text (shown when under the limit) |

The old rules (Increasing, Continuous, Reduction) and the `min_pieces` column are removed.

**What changes, file by file**

| Step | File                                                       | Change                                                      |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | `wasteless-backend/database/schema.sql`                    | replace the `conditions` table                              |
| 2    | `wasteless-backend/database/seed.sql`                      | replace the conditions rows                                 |
| 3    | `wasteless-backend/database/migrate-eco-tip.sql`           | replace the whole file, then run it                         |
| 4    | `wasteless-backend/src/eco-tip.js`                         | replace the whole file                                      |
| 5    | `wasteless-backend/src/eco-tip.test.js`                    | replace the whole file                                      |
| 6    | `wasteless-backend/src/routes/admin.js`                    | replace the conditions routes                               |
| 7–8  | `system.html/vendor-page.html`, `system.js/vendor-page.js` | `<div>` pop-up instead of `<dialog>`, congratulation banner |
| 9–10 | `system.html/admin-page.html`, `system.js/admin-page.js`   | no "Min. Pieces"; "Good Work" has no threshold              |

No changes needed in `routes/stall.js`, `public/js/api.js` or `package.json`.

**Suggested split:** Person 1 = Steps 1–3, Person 2 = Steps 4–5, Person 3 = Step 6, Person 4 / CM = Steps 7–10. Take turns on the one computer, all on branch `eco-tip`.

---

# Part B: Steps

**How to read the steps.** Your VS Code reformats code when you save (Format On Save), so your files may have different line breaks from the code below. That's why each step says **"replace everything from the line that starts with X down to Y"** instead of showing the old code. Select that whole part, delete it, paste the new code, save. The formatting afterwards doesn't matter.

## Step 0: Get ready

1. XAMPP Control Panel → **Start MySQL** (if it says it's already running, that's fine).
2. In the VS Code terminal:
   ```
   git checkout eco-tip
   git pull
   ```
3. After changing a backend file (`wasteless-backend/...`), restart the server (`Ctrl + C`, then `npm.cmd start`). After changing a page, press `Ctrl + F5` in the browser.

---

## Step 1: schema.sql

The `conditions` table loses `min_pieces`, and `threshold` may now be empty (`NULL`), because "Good Work" has no threshold.

Open `wasteless-backend/database/schema.sql`. Replace **everything from the line `CREATE TABLE conditions (` down to its closing `);`** with:

```sql
-- One row per Eco-Tip rule. condition_code is what the code looks for, so don't rename it.
--   high_overall    this week's pieces >= threshold (pieces)  -> warning pop-up
--   category_share  categories with >= threshold % of this week's pieces (top 3) -> their effects + tips
--   good_week       under the high_overall limit -> congratulation (no threshold of its own)
CREATE TABLE conditions (
  condition_id    INT AUTO_INCREMENT PRIMARY KEY,
  condition_code  VARCHAR(30)  NOT NULL UNIQUE,
  condition_name  VARCHAR(120) NOT NULL,
  threshold       INT NULL,
  tip_text        VARCHAR(500) NOT NULL
);
```

Don't touch the `eco_tip` and `notification` tables below it.

---

## Step 2: seed.sql

Open `wasteless-backend/database/seed.sql`. Replace **the whole `INSERT INTO conditions ... ;` statement** (from the line `INSERT INTO conditions` down to the line ending in `');` just before `INSERT INTO eco_tip`) with:

```sql
-- Eco-Tip rules (team decision 2026-10-22). The admin can change them in the Eco-Tips tab.
-- 90 pieces/week = about the busiest 1 in 10 weeks of the demo stalls (they average ~70).
-- 20% because there are 5 packaging categories (20% = an even share).
INSERT INTO conditions (condition_code, condition_name, threshold, tip_text) VALUES
  ('high_overall', 'High Plastic Waste', 90,
   'Reduce single-use items where you can, and work with suppliers that offer less or more sustainable packaging.'),
  ('category_share', 'Top Plastic Categories', 20,
   'Look for products in this category that come with less packaging, or offer an alternative.'),
  ('good_week', 'Good Work', NULL,
   'Great job! Your stall kept its plastic waste under the weekly limit. Keep up the good work!');
```

Keep the `INSERT INTO eco_tip` part (the effects and tips) as it is.

---

## Step 3: Migration (and run it)

This updates databases that already exist (like the one on this computer). It deletes and recreates the 3 Eco-Tip tables with the version 2 rules. Sales, products and stalls are **not** touched. Any tip text the admin edited goes back to the default.

1. Open `wasteless-backend/database/migrate-eco-tip.sql`, delete **everything**, and paste:

```sql
-- Run ONCE on a database made before Eco-Tip version 2 (2026-10-22):
--   phpMyAdmin -> wasteless -> SQL tab -> paste this file -> Go
-- Fresh installs don't need this: schema.sql + seed.sql already include it.
-- Deletes and recreates the 3 Eco-Tip tables with the version 2 rules and the default tips.
-- Sales, products and stalls are not touched. Tip texts edited by the admin go back to the defaults.

USE wasteless;

DROP TABLE IF EXISTS notification, eco_tip, conditions;

-- =====================================================================
-- ECO-TIP  (pop-up on the vendor dashboard, see src/eco-tip.js)
-- "Plastic waste" = pieces sold in the last 7 days (1 item sold = 1 piece).
-- The admin edits the thresholds and tips on the admin page (Eco-Tips tab).
-- =====================================================================
-- One row per Eco-Tip rule. condition_code is what the code looks for, so don't rename it.
--   high_overall    this week's pieces >= threshold (pieces)  -> warning pop-up
--   category_share  categories with >= threshold % of this week's pieces (top 3) -> their effects + tips
--   good_week       under the high_overall limit -> congratulation (no threshold of its own)
CREATE TABLE conditions (
  condition_id    INT AUTO_INCREMENT PRIMARY KEY,
  condition_code  VARCHAR(30)  NOT NULL UNIQUE,
  condition_name  VARCHAR(120) NOT NULL,
  threshold       INT NULL,
  tip_text        VARCHAR(500) NOT NULL
);

-- The category-specific part of the pop-up: bad effects (one per line) + targeted tip.
CREATE TABLE eco_tip (
  tip_id        INT AUTO_INCREMENT PRIMARY KEY,
  packaging_id  INT NOT NULL UNIQUE,
  condition_id  INT NULL,               -- the category_share rule
  effects       VARCHAR(1000),
  tip_text      VARCHAR(500) NOT NULL,
  FOREIGN KEY (packaging_id) REFERENCES packaging_category(packaging_id) ON DELETE CASCADE,
  FOREIGN KEY (condition_id) REFERENCES conditions(condition_id)
);

CREATE TABLE notification (
  notification_id  INT AUTO_INCREMENT PRIMARY KEY,
  canteen_id       INT NOT NULL,
  tip_id           INT NULL,
  category_id      INT NULL,
  product_id       INT NULL,
  notif_type       VARCHAR(30) NOT NULL,
  message          VARCHAR(500) NOT NULL,
  is_read          TINYINT(1) NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canteen_id)  REFERENCES canteen(canteen_id),
  FOREIGN KEY (tip_id)      REFERENCES eco_tip(tip_id),
  FOREIGN KEY (category_id) REFERENCES category(category_id),
  FOREIGN KEY (product_id)  REFERENCES product(product_id)
);

-- Eco-Tip rules (team decision 2026-10-22). The admin can change them in the Eco-Tips tab.
-- 90 pieces/week = about the busiest 1 in 10 weeks of the demo stalls (they average ~70).
-- 20% because there are 5 packaging categories (20% = an even share).
INSERT INTO conditions (condition_code, condition_name, threshold, tip_text) VALUES
  ('high_overall', 'High Plastic Waste', 90,
   'Reduce single-use items where you can, and work with suppliers that offer less or more sustainable packaging.'),
  ('category_share', 'Top Plastic Categories', 20,
   'Look for products in this category that come with less packaging, or offer an alternative.'),
  ('good_week', 'Good Work', NULL,
   'Great job! Your stall kept its plastic waste under the weekly limit. Keep up the good work!');

INSERT INTO eco_tip (packaging_id, condition_id, effects, tip_text)
SELECT pk.packaging_id, (SELECT condition_id FROM conditions WHERE condition_code = 'category_share'), t.effects, t.tip_text
FROM packaging_category pk JOIN (
  SELECT 'Tetra Pak' AS name,
    'Difficult to recycle: bonded paper, plastic, and aluminum layers are hard to separate.\nPersistent litter: does not easily degrade when trapped in streets or drainage systems, causing pooling and blockages.' AS effects,
    'Offer beverages using bulk dispensers with reusable cups, or encourage students to bring their own tumblers.' AS tip_text
  UNION ALL SELECT 'Polystyrene (PS)',
    'Easily fragmented into microplastics: breaks down into tiny particles that spread into air and water.\nChemical leaching: can release styrene chemicals when exposed to heat.\nDrainage blockage: floating foam cups easily clog waterways.',
    'Switch to paper-based or biodegradable containers for snacks and soups.'
  UNION ALL SELECT 'Plastic Container',
    'High landfill volume: bulky containers quickly fill up waste bins and landfills.\nVector breeding ground: containers left outdoors fill with rainwater and can become breeding sites for mosquitoes.',
    'Start a "Bring Your Own Container" (BYOC) incentive, or use washable, reusable containers inside the canteen.'
  UNION ALL SELECT 'Plastic Wrapper',
    'Primary cause of clogged channels: light and thin, so wind and water easily carry them into drainage systems.\nWildlife hazard: easily swallowed by campus animals and local wildlife.',
    'Offer bulk or family-sized snacks for portioning, or promote packaging-free options like traditional local delicacies.'
  UNION ALL SELECT 'Plastic Lid / Cap',
    'Choking hazard: small enough to be swallowed by stray animals or birds.\nSeparated from recyclables: often detached from bottles and missed during recycling sorting.',
    'Provide a dedicated "Cap Collection Bin" so small closures can be kept together for recycling programs.'
) t ON t.name = pk.packaging_name;
```

2. **Run it:** http://localhost/phpmyadmin → click `wasteless` → **SQL** tab → paste the whole file → **Go**.

3. **Check it** in the same SQL tab:

```sql
SELECT condition_code, threshold FROM conditions;
SELECT COUNT(*) FROM eco_tip;
SELECT COUNT(*) FROM sales_record;
```

You should see 3 rows (`high_overall` 90, `category_share` 20, `good_week` NULL), 5 tips, and the same number of sales as before (thousands).

> From now until Step 10 is finished, the vendor and admin pages show errors, because the database is on version 2 and the code is still version 1. That's expected.

---

## Step 4: The rule logic (eco-tip.js)

Open `wasteless-backend/src/eco-tip.js`, delete **everything**, and paste:

```js
// Eco-Tip pop-up for the vendor dashboard (rules: team decision 2026-10-22, from Condition_Tip.pdf).
// Plastic waste = pieces sold (1 item sold = 1 piece). "This week" = the last 7 days, today included.
// Thresholds and tips live in the `conditions` and `eco_tip` tables (admin: Eco-Tips tab).
//   - this week >= weekly limit (high_overall)  -> warning, with the effects + tips of the
//     categories that reach the share threshold (category_share, 20%), at most the top 3
//   - under the limit                           -> congratulation (good_week)
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
```

What changed from version 1:

- Only **this week** is counted, so there's no comparison with last week anymore.
- The result is **one** level (`warning` or `positive`) instead of a list of alerts.
- `categories` holds the top plastic categories (at most 3), each with its effects and tip.

The vendor page in Step 8 depends on this result:

```json
{
  "week_total": 97,
  "limit": 90,
  "level": "warning",
  "title": "High Plastic Waste: 97 pieces this week (limit 90)",
  "tip": "Reduce single-use items where you can, ...",
  "categories": [
    {
      "packaging_name": "Plastic Container",
      "pieces": 52,
      "percent": 53.6,
      "effects": ["High landfill volume: ...", "Vector breeding ground: ..."],
      "tip": "Start a \"Bring Your Own Container\" ..."
    },
    {
      "packaging_name": "Polystyrene (PS)",
      "pieces": 20,
      "percent": 20.6,
      "effects": ["..."],
      "tip": "..."
    }
  ]
}
```

When the stall is under the limit: `"level": "positive"`, the title and tip are the "Good Work" ones, and `"categories": []`.

---

## Step 5: Tests

Open `wasteless-backend/src/eco-tip.test.js`, delete **everything**, and paste:

```js
// Run: npm test   (checks the Eco-Tip rules without a database)
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
```

Run it (inside `wasteless-backend`):

```
npm.cmd test
```

You should see **`pass 7`** and `fail 0`. (If you get `evaluate is not a function`, Step 4's file isn't saved: press `Ctrl + S` in it.)

---

## Step 6: Admin routes

Open `wasteless-backend/src/routes/admin.js`. Replace **everything from the line `const UNITS = {` down to the end of the `router.put( "/eco/conditions/:id" ...` route**, so the last line you replace is the `);` just above the comment `// One row per packaging category`. Paste:

```js
// ---------- Eco-Tip Management (thresholds + tips) ----------
const UNITS = {
  high_overall: "pieces / week",
  category_share: "% of the week",
};

router.get(
  "/eco/conditions",
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT * FROM conditions ORDER BY condition_id",
    );
    res.json(rows.map((r) => ({ ...r, unit: UNITS[r.condition_code] || "" })));
  }),
);

// good_week has no threshold of its own (it just means "under the weekly limit"),
// so for that row only the text is saved.
router.put(
  "/eco/conditions/:id",
  wrap(async (req, res) => {
    required(req.body, ["tip_text"]);
    const [[cond]] = await pool.query(
      "SELECT condition_code, threshold FROM conditions WHERE condition_id = ?",
      [req.params.id],
    );
    if (!cond) throw new HttpError(404, "Condition not found");
    let threshold = null;
    if (cond.threshold !== null) {
      threshold = Number(req.body.threshold);
      const max = cond.condition_code === "category_share" ? 100 : 100000; // a share can't be over 100%
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > max) {
        const message = `Threshold must be a whole number from 1 to ${max}`;
        throw new HttpError(400, message + ".", { threshold: message });
      }
    }
    await pool.query(
      "UPDATE conditions SET threshold = ?, tip_text = ? WHERE condition_id = ?",
      [threshold, String(req.body.tip_text).trim(), req.params.id],
    );
    res.json({ condition_id: Number(req.params.id) });
  }),
);
```

Keep the `/eco/tips` routes below it as they are.

**Check it:** restart the server, log in as admin (`admin@wasteless.local` / `admin123`), open http://localhost:36000/api/admin/eco/conditions. You should see 3 conditions; "Good Work" has `"threshold": null`.

---

## Step 7: Vendor page HTML

The pop-up becomes a `<div>` (version 1 used a `<dialog>`), and the weekly summary is removed.

Open `system.html/vendor-page.html`. Replace **everything from the line `<!-- Eco Tip Banner -->` down to the line `</dialog>`** (the end of the old Eco-Tip pop-up, just before the `</div>` that closes the Dashboard page) with:

```html
<!-- Eco Tip Banner: congratulates when under the weekly limit ("positive" class) -->
<aside class="eco-tip-banner" id="ecoTipBanner">
  <strong>EcoTip 101</strong>
  <span id="ecoTipBannerText"
    >Every item sold leaves plastic behind. Check which packaging category your
    stall uses most, and look for products with less of it.</span
  >
  <button type="button" id="ecoTipOpenBtn" class="btn outline btn-sm" hidden>
    View Eco-Tip
  </button>
</aside>

<!-- Eco-Tip pop-up (a div; style it as an overlay). Opens on every dashboard visit
                 while the stall is over the weekly limit. -->
<div
  class="eco-tip-popup"
  id="ecoTipPopup"
  role="dialog"
  aria-labelledby="ecoTipTitle"
  hidden
>
  <h2 id="ecoTipTitle">Eco-Tip</h2>
  <p id="ecoTipMessage"></p>
  <div id="ecoTipCategories"></div>
  <button type="button" id="ecoTipCloseBtn" class="btn primary">Got it</button>
</div>
```

> **For the CM:** there's no CSS yet, so the `<div>` shows under the banner like normal text. To make it a real pop-up, style `.eco-tip-popup` as an overlay, for example `position: fixed; inset: 10% 20%; overflow: auto; background: #fff; box-shadow: 0 0 0 100vmax rgba(0,0,0,.4);`. Also add `[hidden] { display: none !important; }`, or it will never hide (see FRONTEND-GUIDE.md).

---

## Step 8: Vendor page script

Open `system.js/vendor-page.js`. Two changes:

1. Replace **everything from the line `let defaultBannerText = null;` down to the line just before `// ---------- Download Report (PDF, once every 7 days) ----------`** (that's the whole old `loadEcoTips` function) with:

```js
// ---------- Eco-Tip pop-up ----------
// The backend checks this week's plastic waste against the rules (admin page > Eco-Tips).
// Over the weekly limit -> the pop-up opens (on every dashboard visit) with the effects and
// tips of the top plastic categories. Under the limit -> the banner congratulates instead.
async function loadEcoTips() {
  const data = await WasteLessAPI.getEcoTips();
  const warning = data.level === "warning";

  const banner = document.getElementById("ecoTipBanner");
  const bannerText = document.getElementById("ecoTipBannerText");
  const openBtn = document.getElementById("ecoTipOpenBtn");
  if (bannerText) {
    bannerText.textContent = warning
      ? `Your stall is over the weekly plastic limit (${data.week_total} of ${data.limit} pieces).`
      : data.title + ". " + data.tip;
  }
  if (banner) banner.classList.toggle("positive", !warning);
  if (openBtn) openBtn.hidden = !warning;

  document.getElementById("ecoTipTitle").textContent = "WARNING: " + data.title;
  document.getElementById("ecoTipMessage").textContent = data.tip;
  document.getElementById("ecoTipCategories").innerHTML = data.categories
    .map(
      (c) => `
    <section class="eco-category">
      <h3>${escapeHtml(c.packaging_name)}: ${c.pieces} pieces (${c.percent}%)</h3>
      ${
        c.effects.length
          ? `<p>Negative community and environmental effects:</p>
        <ul>${c.effects.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`
          : ""
      }
      <p class="eco-tip-text"><strong>Eco-Tip:</strong> ${escapeHtml(c.tip)}</p>
    </section>`,
    )
    .join("");

  const onDashboard = !document.getElementById("page-dashboard").hidden; // still there when the data arrives
  if (warning && onDashboard) openEcoTip();
  else if (!warning) closeEcoTip();
}

function openEcoTip() {
  const popup = document.getElementById("ecoTipPopup");
  popup.hidden = false;
  popup.scrollIntoView({ block: "center" });
  document.getElementById("ecoTipCloseBtn").focus();
}

function closeEcoTip() {
  document.getElementById("ecoTipPopup").hidden = true;
}
```

Every value put into `innerHTML` goes through `escapeHtml()`, so an admin can't inject HTML through a tip.

2. In `function setupEventListeners()`, replace **everything from the line `const ecoTipDialog = document.getElementById("ecoTipDialog");` down to the line just before `// Graph range dropdown (7 / 14 / 30 days)`** with:

```js
// Eco-Tip pop-up buttons (Esc closes it too)
const ecoTipCloseBtn = document.getElementById("ecoTipCloseBtn");
const ecoTipOpenBtn = document.getElementById("ecoTipOpenBtn");
if (ecoTipCloseBtn) ecoTipCloseBtn.addEventListener("click", closeEcoTip);
if (ecoTipOpenBtn) ecoTipOpenBtn.addEventListener("click", openEcoTip);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEcoTip();
});
```

The line in `showPage()` that calls `loadEcoTips()` on every dashboard visit stays as it is.

---

## Step 9: Admin page HTML

Open `system.html/admin-page.html`. Two changes:

1. In the Eco-Tips **Conditions** table header, **delete the line** `<th>Min. Pieces</th>`.

2. Replace **everything from the line `<dialog id="condition-dialog">` down to its `</dialog>`** with:

```html
<dialog id="condition-dialog">
  <form id="condition-form">
    <h2>Edit Condition</h2>
    <input type="hidden" name="condition_id" />
    <p>
      <label
        >Condition <input type="text" name="condition_name" readonly
      /></label>
    </p>
    <!-- hidden for "Good Work", which has no threshold -->
    <p id="condition-form-threshold-row">
      <label
        >Threshold <input type="number" name="threshold" min="1" step="1"
      /></label>
      <span id="condition-form-unit"></span>
    </p>
    <p>
      <label
        >Eco-Tip
        <textarea name="tip_text" rows="4" maxlength="500" required></textarea>
      </label>
    </p>
    <button type="submit">Save</button>
    <button type="button" data-action="close-dialog">Cancel</button>
  </form>
</dialog>
```

---

## Step 10: Admin page script

Open `system.js/admin-page.js`. Two changes:

1. Replace the **whole `function renderConditions(conditions) { ... }`** (down to its closing `}`) with:

```js
function renderConditions(conditions) {
  currentConditions = conditions;
  let rows = "";
  conditions.forEach(function (c) {
    const threshold =
      c.threshold === null
        ? "(under the weekly limit)"
        : c.threshold + " " + c.unit;
    rows += `<tr>
      <td>${escapeHtml(c.condition_name)}</td>
      <td>${escapeHtml(threshold)}</td>
      <td>${escapeHtml(c.tip_text)}</td>
      <td><button type="button" data-action="edit" data-id="${escapeHtml(c.condition_id)}">Edit</button></td>
    </tr>`;
  });
  byId("condition-table-body").innerHTML = rows;
}
```

2. Replace the **whole `listenToTableClicks("condition-table-body", { ... });`** block (down to its closing `});`) with:

```js
listenToTableClicks("condition-table-body", {
  edit: function (id) {
    const condition = findById(currentConditions, "condition_id", id);
    openForm("condition-form", condition);
    const hasThreshold = condition.threshold !== null; // "Good Work" has none
    byId("condition-form-threshold-row").hidden = !hasThreshold;
    byId("condition-form").elements.threshold.required = hasThreshold;
    byId("condition-form-unit").textContent = condition.unit;
  },
});
```

---

## Step 11: Test everything

1. `npm.cmd test` → `pass 7`, `fail 0`.
2. Restart the server, open http://localhost:3000, press **F12 → Console** on each page: there should be no red errors.

**Under the limit (congratulation):** log in as a demo vendor (e.g. `kape@demo.local` / `demo123`). If their week is under 90:

- [ ] No pop-up. The banner says "Good Work: … pieces this week (limit 90). Great job! …". No "View Eco-Tip" button.

**Over the limit (warning):** add temporary sales for Tita Bea today in phpMyAdmin → `wasteless` → SQL. They use **50** per sale, so they're easy to find and remove later (demo sales are only 1 to 6):

```sql
INSERT INTO sales_record (product_id, quantity_sold, unit_price, sold_at)
SELECT product_id, 50, unit_price, NOW() FROM product WHERE product_name IN ('Yakult', 'Cup Noodles');
```

Log in as `bea@demo.local` / `demo123`:

- [ ] The pop-up shows "WARNING: High Plastic Waste: … pieces this week (limit 90)", the general tip, and **Polystyrene (PS)** with its 3 effects and tip, plus any other category at 20% or more (never more than 3).
- [ ] "Got it" closes it; **Esc** closes it; "View Eco-Tip" in the banner opens it again.
- [ ] Clicking **Product Listing** hides it; clicking **Dashboard** again opens it again.

As admin → **Eco-Tips**:

- [ ] The Conditions table has 3 rows and no "Min. Pieces" column. "Good Work" shows "(under the weekly limit)".
- [ ] Edit **Good Work**: there is no Threshold field. Change the text → Save → the table shows it.
- [ ] Edit **High Plastic Waste** → 500 → Save. As Bea, the banner now congratulates and there's no pop-up. Set it back to **90**.
- [ ] Edit **Top Plastic Categories** → 150 → Save: you get "Threshold must be a whole number from 1 to 100." and nothing is saved.
- [ ] As a vendor, http://localhost:3000/api/admin/eco/conditions says "Only admin accounts can do this".

**Remove the test sales** when done. This deletes only today's sales of exactly 50, so the demo sales stay:

```sql
DELETE FROM sales_record WHERE quantity_sold = 50 AND sold_at >= CURDATE();
```

Then check `SELECT COUNT(*) FROM sales_record;` is still in the thousands.

---

## Step 12: Docs, commit and pull request

1. **README.md** (root): under "After pulling new code from GitHub", add: if the database was made before 2026-10-22 (or the Eco-Tips tab shows "Min. Pieces"), run `wasteless-backend/database/migrate-eco-tip.sql` once in phpMyAdmin.
2. **wasteless-backend/README.md**: add the 5 Eco-Tip routes to the API table (`GET /api/stall/eco-tips`, `GET /api/admin/eco/conditions`, `PUT /api/admin/eco/conditions/:id`, `GET /api/admin/eco/tips`, `PUT /api/admin/eco/tips/:packaging_id`), and replace "Eco-Tip logic comes later" in "Not done yet" with the rules from Part A.
3. **FRONTEND-GUIDE.md**: add the ids and classes the scripts need:
   - **Vendor page:** `ecoTipBanner`, `ecoTipBannerText`, `ecoTipOpenBtn`, `ecoTipPopup` (class `eco-tip-popup`), `ecoTipTitle`, `ecoTipMessage`, `ecoTipCategories`, `ecoTipCloseBtn`, and the generated classes `eco-category`, `eco-tip-text`, `positive` (on the banner).
   - **Admin page:** `data-section="eco"`, `section-eco`, `condition-table-body`, `ecotip-table-body`, `condition-dialog` / `condition-form` (fields `condition_id`, `condition_name`, `threshold`, `tip_text`, plus `condition-form-threshold-row` and `condition-form-unit`), and `ecotip-dialog` / `ecotip-form` (fields `packaging_id`, `packaging_name`, `effects`, `tip_text`).
4. Commit and push. **Add only the project files**; `git add .` would also add `PROGRESS.md` and `.claude/`, which must not be committed:
   ```
   git status
   git add system.html system.js wasteless-backend README.md FRONTEND-GUIDE.md ECO-TIP-GUIDE.md
   git commit -m "Eco-Tip version 2: weekly limit, top 3 categories at 20%, congratulation, div pop-up"
   git push
   ```
5. On GitHub, open a **pull request** from `eco-tip` into `main`, and ask someone to review it before merging.

---

## Why the rules look like this

The team's suggestions, and how each one is built:

| Team's suggestion                                                | In version 2                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Effects picked from the 3 categories with the most plastic waste | ✔ at most the top 3, most pieces first                           |
| Use 20% because there are only 5 categories                      | ✔ a category's effects show when its share ≥ 20%                 |
| If 20% is not reached, congratulate the vendor                   | changed, see below: congratulate when **under the weekly limit** |
| If only 1 category reaches 20%, show only its effects            | ✔                                                                |
| Summarized chart is tentative, pop-up only for now               | ✔ no summary or chart in the pop-up                              |
| The Eco-Tip is displayed in a `<div>`                            | ✔ `<div id="ecoTipPopup">`                                       |

**Why "congratulate if 20% is not reached" had to change:** with 5 categories, the shares always add up to 100%, so **the biggest category is always at least 20%**. For example, if you split 100 pieces as evenly as possible, you still get 20 + 20 + 20 + 20 + 20, and every category is at exactly 20%. So a stall that sells anything would **never** be congratulated. The demo data shows it too: in all 159 stall-weeks (3 stalls × 53 weeks), at least one category reached 20% every single week.

So the warning-or-congratulate decision uses the **weekly limit (90 pieces)**, and 20% is used to **pick which effects to show**. With the demo data, stalls average about 70 pieces a week, so most weeks they are congratulated and the busiest weeks get the warning.

**Why 90?** The demo stalls average about 70 pieces a week and peak at about 105. At 90, a warning shows in about 1 week out of 10. The admin can change it.

The PDF's own note still applies: the numbers are only triggers for helpful tips, not environmental standards or penalties.
