# Eco-Tip: Step-by-Step Guide for the Backend Team

This guide builds the **Eco-Tip pop-up**: a warning shown to a vendor on their dashboard when their plastic waste reaches a set condition, with a tip on how to reduce it.

- The rules come from the team's **Condition_Tip.pdf**. The PDF was reviewed and some rules were fixed because they couldn't be coded or always triggered (see [Why the rules differ from the PDF](#why-the-rules-differ-from-the-pdf)). **Build the rules in this guide, not the raw PDF.**
- Every code block below has been run and tested. Copy it exactly, then read it so you can explain it.
- Read the root [README.md](README.md) first to get the project running.

**Contents**
- [Part A: What you're building](#part-a-what-youre-building) (read first)
- [Part B: Steps](#part-b-steps)
  - [Step 0: Get ready](#step-0-get-ready)
  - [Step 1: Database tables (schema.sql)](#step-1-database-tables-schemasql)
  - [Step 2: Default rules and tips (seed.sql)](#step-2-default-rules-and-tips-seedsql)
  - [Step 3: Migration for existing databases](#step-3-migration-for-existing-databases)
  - [Step 4: The rule logic (eco-tip.js)](#step-4-the-rule-logic-eco-tipjs)
  - [Step 5: Tests](#step-5-tests)
  - [Step 6: Vendor route](#step-6-vendor-route)
  - [Step 7: Admin routes](#step-7-admin-routes)
  - [Step 8: API helper](#step-8-api-helper)
  - [Step 9: Vendor page HTML](#step-9-vendor-page-html)
  - [Step 10: Vendor page script](#step-10-vendor-page-script)
  - [Step 11: Admin page HTML](#step-11-admin-page-html)
  - [Step 12: Admin page script](#step-12-admin-page-script)
  - [Step 13: Test everything](#step-13-test-everything)
  - [Step 14: Docs, commit and pull request](#step-14-docs-commit-and-pull-request)
- [Why the rules differ from the PDF](#why-the-rules-differ-from-the-pdf)

---

# Part A: What you're building

## What it does

Every time a vendor opens the **Dashboard**, the server checks that stall's plastic waste for the **last 7 days** against 5 conditions.
- If a **warning** condition is reached, a pop-up opens with a warning heading, this week's waste per packaging category, and one section per warning with its tip (plus "bad effects" for category warnings).
- If waste **went down**, the EcoTip banner on the dashboard shows a positive message instead (no pop-up).
- The pop-up shows on every dashboard visit for as long as the condition holds.
- The **admin** can change every threshold and tip from a new **Eco-Tips** tab.

## Definitions

| Term | Meaning |
|---|---|
| **Piece** | 1 item sold = 1 piece of plastic waste. Each product has one `packaging_id`, so a sale counts toward that packaging category. |
| **Plastic waste** | Pieces sold: `sales_record.quantity_sold` joined to `product.packaging_id`. Same data as the dashboard graph. |
| **This week** (week 0) | The last 7 days, **today included**. |
| **Last week** (week 1) | The 7 days before that. A sale's week number is `FLOOR(DATEDIFF(CURDATE(), DATE(sold_at)) / 7)`. |
| **Share** | A category's pieces this week ÷ the stall's total pieces this week × 100. |
| **Change** | (this week − last week) ÷ last week × 100. |

## The 5 conditions

Defaults below. **All numbers are stored in the database** so the admin can change them.

| # | Code | Name | Rule | Level | Shows |
|---|---|---|---|---|---|
| 1 | `high_overall` | High Overall Waste | this week's total **≥ 90** pieces | warning | pop-up section + general tip |
| 2 | `category_share` | High Category Share | a category's share **≥ 40%** **and** it has **≥ 20** pieces this week | warning | pop-up section **per category**, with its bad effects + tip |
| 3 | `increase` | Increasing Plastic Waste | change **≥ +10%**, only if last week had **≥ 20** pieces | warning | pop-up section + tip |
| 4 | `continuous` | Continuous High Usage | rule 1 reached in **each of the last 2** weeks | high | **replaces** rule 1, shown first |
| 5 | `reduction` | Reduction Observed | change **≤ −10%**, only if last week had **≥ 20** pieces | positive | banner only, **no pop-up** |

Details that are easy to get wrong (the code in Step 4 handles all of them):
- Comparisons use whole numbers to avoid rounding mistakes (`pieces * 100 >= threshold * total`). Exactly 40% **counts**.
- Rule 4 uses rule 1's limit for each week. When rule 4 is reached, rule 1 is **not** shown too.
- Rules 3 and 5 are skipped when last week had fewer than 20 pieces (no division by zero, no "+300%" from 2 → 8).
- Rule 2 can trigger for several categories at once.
- A category with no tip of its own (e.g. just added by the admin) uses rule 2's general tip.

**Why 90?** The demo stalls (`demo-data.sql`) average about 70 pieces a week and peak at about 105. At 90, a warning shows in about 1 week out of 10; at 80 it would be about 1 in 3.

## Files you will touch

| Step | File | New? |
|---|---|---|
| 1 | `wasteless-backend/database/schema.sql` | edit |
| 2 | `wasteless-backend/database/seed.sql` | edit |
| 3 | `wasteless-backend/database/migrate-eco-tip.sql` | **new** |
| 4 | `wasteless-backend/src/eco-tip.js` | **new** |
| 5 | `wasteless-backend/src/eco-tip.test.js`, `wasteless-backend/package.json` | **new**, edit |
| 6 | `wasteless-backend/src/routes/stall.js` | edit |
| 7 | `wasteless-backend/src/routes/admin.js` | edit |
| 8 | `wasteless-backend/public/js/api.js` | edit |
| 9–10 | `system.html/vendor-page.html`, `system.js/vendor-page.js` | edit |
| 11–12 | `system.html/admin-page.html`, `system.js/admin-page.js` | edit |
| 14 | `README.md`, `wasteless-backend/README.md`, `FRONTEND-GUIDE.md` | edit |

**Suggested split:** Person 1 = Steps 1–3, Person 2 = Steps 4–5, Person 3 = Steps 6–8, Person 4 / CM = Steps 9–12. Everyone does Step 13 for their part. Steps 4–5 don't need the database, so Person 2 can start right away. Since you all work on one computer, take turns and keep everything on the same branch.

---

# Part B: Steps

## Step 0: Get ready

1. XAMPP Control Panel → **Start MySQL**.
2. In the VS Code terminal (one line at a time):
   ```
   git checkout eco-tip-guide
   git pull
   git checkout -b eco-tip
   ```
3. Start the server when a step says to test: `cd wasteless-backend`, then `npm.cmd start`. After changing a backend file (`wasteless-backend/src/...`), stop it with `Ctrl + C` and start it again. After changing an HTML/JS page, just press `Ctrl + F5` in the browser.

---

## Step 1: Database tables (schema.sql)

The tables `conditions`, `eco_tip` and `notification` already exist (from the ERD) but are empty and unused. They were designed for sales/revenue amounts and **food** categories, so change them to fit the rules:
- `conditions`: one row per rule (`condition_code` is what the code looks for; `threshold`; `min_pieces`; `tip_text`).
- `eco_tip`: the bad effects + tip per **packaging** category. `ON DELETE CASCADE` lets the admin still delete a packaging category.
- `notification`: unchanged (not used; tips are checked live on every visit).

Open `wasteless-backend/database/schema.sql`. **Find** this whole part (from the `ECO-TIP (later phase)` heading down to the end of `CREATE TABLE notification`):

```sql
-- =====================================================================
-- ECO-TIP (later phase) — tables created now so the DB matches the ERD
-- =====================================================================
CREATE TABLE conditions (
  condition_id    INT AUTO_INCREMENT PRIMARY KEY,
  condition_name  VARCHAR(120) NOT NULL,
  total_sold      INT NULL,              -- threshold on units sold
  total_revenue   DECIMAL(12,2) NULL     -- threshold on revenue
);

CREATE TABLE eco_tip (
  ...
);

CREATE TABLE notification (
  ...
);
```

**Replace it with:**

```sql
-- =====================================================================
-- ECO-TIP  (pop-up on the vendor dashboard, see src/eco-tip.js)
-- "Plastic waste" = pieces sold in the last 7 days (1 item sold = 1 piece).
-- The admin edits the thresholds and tips on the admin page (Eco-Tips tab).
-- =====================================================================
-- One row per rule. condition_code is what the code looks for, so don't rename it.
--   high_overall    total pieces this week >= threshold (pieces)
--   category_share  one packaging category >= threshold % of this week's pieces, and >= min_pieces
--   increase        this week >= threshold % more than last week (last week needs >= min_pieces)
--   continuous      high_overall reached for threshold weeks in a row
--   reduction       this week >= threshold % less than last week (last week needs >= min_pieces)
CREATE TABLE conditions (
  condition_id    INT AUTO_INCREMENT PRIMARY KEY,
  condition_code  VARCHAR(30)  NOT NULL UNIQUE,
  condition_name  VARCHAR(120) NOT NULL,
  threshold       INT NOT NULL,
  min_pieces      INT NOT NULL DEFAULT 0,
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
```

Keep the `-- BUSINESS_ANALYTICS ...` part after it as it is.

---

## Step 2: Default rules and tips (seed.sql)

The default rules are the table in Part A. The effects and tips per category are from the PDF's "Community Impact Matrix". The `eco_tip` rows are matched to packaging categories **by name**, so they work whatever ids the categories have. `\n` inside `effects` = a new line (one effect per line).

Open `wasteless-backend/database/seed.sql` and **add this at the very end**:

```sql
-- Eco-Tip rules + tips (from Condition_Tip.pdf). The admin can change them in the Eco-Tips tab.
-- 90 pieces/week = about the busiest 1 in 10 weeks of the demo stalls (they average ~70).
INSERT INTO conditions (condition_code, condition_name, threshold, min_pieces, tip_text) VALUES
  ('high_overall', 'High Overall Waste', 90, 0,
   'Reduce single-use items where you can, and work with suppliers that offer less or more sustainable packaging.'),
  ('category_share', 'High Category Share', 40, 20,
   'Look for products in this category that come with less packaging, or offer an alternative.'),
  ('increase', 'Increasing Plastic Waste', 10, 20,
   'Check which products caused the increase and whether they have lower-packaging alternatives.'),
  ('continuous', 'Continuous High Usage', 2, 0,
   'Review your packaging options and talk to your suppliers about alternatives that create less plastic waste.'),
  ('reduction', 'Reduction Observed', 10, 20,
   'Great job! Keep up the practices that are reducing your plastic waste.');

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

---

## Step 3: Migration for existing databases

Everyone who already has the `wasteless` database (including this computer) needs to change it once. This file deletes the 3 old Eco-Tip tables (safe: they were empty), recreates them, and adds the defaults. It's the same SQL as Steps 1–2.

Create **`wasteless-backend/database/migrate-eco-tip.sql`**:

```sql
-- Run ONCE on a database made before the Eco-Tip feature (2026-10-19):
--   phpMyAdmin -> wasteless -> SQL tab -> paste this file -> Go
-- Fresh installs don't need this: schema.sql + seed.sql already include it.
-- Replaces the old conditions / eco_tip / notification tables (nothing used them,
-- so they are empty) with the Eco-Tip version, then adds the default rules and tips.
USE wasteless;

DROP TABLE IF EXISTS notification, eco_tip, conditions;

-- =====================================================================
-- ECO-TIP  (pop-up on the vendor dashboard, see src/eco-tip.js)
-- "Plastic waste" = pieces sold in the last 7 days (1 item sold = 1 piece).
-- The admin edits the thresholds and tips on the admin page (Eco-Tips tab).
-- =====================================================================
-- One row per rule. condition_code is what the code looks for, so don't rename it.
--   high_overall    total pieces this week >= threshold (pieces)
--   category_share  one packaging category >= threshold % of this week's pieces, and >= min_pieces
--   increase        this week >= threshold % more than last week (last week needs >= min_pieces)
--   continuous      high_overall reached for threshold weeks in a row
--   reduction       this week >= threshold % less than last week (last week needs >= min_pieces)
CREATE TABLE conditions (
  condition_id    INT AUTO_INCREMENT PRIMARY KEY,
  condition_code  VARCHAR(30)  NOT NULL UNIQUE,
  condition_name  VARCHAR(120) NOT NULL,
  threshold       INT NOT NULL,
  min_pieces      INT NOT NULL DEFAULT 0,
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

-- Eco-Tip rules + tips (from Condition_Tip.pdf). The admin can change them in the Eco-Tips tab.
-- 90 pieces/week = about the busiest 1 in 10 weeks of the demo stalls (they average ~70).
INSERT INTO conditions (condition_code, condition_name, threshold, min_pieces, tip_text) VALUES
  ('high_overall', 'High Overall Waste', 90, 0,
   'Reduce single-use items where you can, and work with suppliers that offer less or more sustainable packaging.'),
  ('category_share', 'High Category Share', 40, 20,
   'Look for products in this category that come with less packaging, or offer an alternative.'),
  ('increase', 'Increasing Plastic Waste', 10, 20,
   'Check which products caused the increase and whether they have lower-packaging alternatives.'),
  ('continuous', 'Continuous High Usage', 2, 0,
   'Review your packaging options and talk to your suppliers about alternatives that create less plastic waste.'),
  ('reduction', 'Reduction Observed', 10, 20,
   'Great job! Keep up the practices that are reducing your plastic waste.');

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

**Run it:** http://localhost/phpmyadmin → click `wasteless` on the left → **SQL** tab → paste the whole file → **Go**.

**Check it:** in the same SQL tab run:

```sql
SELECT condition_code, threshold, min_pieces FROM conditions;
SELECT p.packaging_name, LEFT(e.tip_text, 40) FROM eco_tip e JOIN packaging_category p USING (packaging_id);
```

You should see **5 conditions** (90 / 40 / 10 / 2 / 10) and **5 tips**.

---

## Step 4: The rule logic (eco-tip.js)

This file is the heart of the feature. It's split in two:
- `evaluate()` is a **pure function** (no database): it gets the rules, the packaging categories and the pieces sold per week, and returns the summary + alerts. That's what makes it easy to test in Step 5.
- `ecoTips(canteenId)` runs 3 queries for one stall and calls `evaluate()`.

The result looks like this (the vendor page in Step 10 depends on this shape):

```json
{
  "week_total": 101,
  "previous_week_total": 57,
  "breakdown": [{ "packaging_id": 2, "packaging_name": "Polystyrene (PS)", "pieces": 87, "percent": 86.1 }],
  "alerts": [
    { "code": "high_overall", "level": "warning", "title": "High Overall Waste: 101 pieces this week (limit 90)", "tip": "..." },
    { "code": "category_share", "level": "warning", "packaging_name": "Polystyrene (PS)",
      "title": "High Category Share: Polystyrene (PS) is 86.1% of your plastic waste this week",
      "effects": ["Easily fragmented into microplastics: ...", "..."], "tip": "Switch to paper-based ..." }
  ]
}
```

Create **`wasteless-backend/src/eco-tip.js`**:

```js
// Eco-Tip pop-up for the vendor dashboard (rules from Condition_Tip.pdf).
// Plastic waste = pieces sold (1 item sold = 1 piece). "This week" = the last 7 days,
// today included; week 1 = the 7 days before that, and so on.
// Thresholds and tips live in the `conditions` and `eco_tip` tables (admin: Eco-Tips tab).
const pool = require('./db');

// Pure part (no database), so it can be tested on its own.
//   conds     rows of `conditions`
//   packaging [{ packaging_id, packaging_name, effects, tip_text }] (tip fields may be null)
//   rows      [{ wk, packaging_id, pieces }] pieces sold per week per packaging category
function evaluate(conds, packaging, rows) {
  const c = Object.fromEntries(conds.map((x) => [x.condition_code, x]));
  const weeks = Math.max(2, c.continuous ? c.continuous.threshold : 0);
  const totals = Array(weeks).fill(0);
  rows.forEach((r) => { if (r.wk >= 0 && r.wk < weeks) totals[r.wk] += Number(r.pieces); });
  const [total, previous] = totals;

  const breakdown = packaging.map((pk) => {
    const pieces = rows.filter((r) => r.wk === 0 && r.packaging_id === pk.packaging_id)
      .reduce((sum, r) => sum + Number(r.pieces), 0);
    return { packaging_id: pk.packaging_id, packaging_name: pk.packaging_name, pieces,
      percent: total ? Math.round((pieces / total) * 1000) / 10 : 0 };
  });

  const alerts = [];
  const overall = c.high_overall;
  const over = (n) => n >= overall.threshold;

  // Over the weekly limit: "continuous" (several weeks in a row) replaces the plain warning.
  if (overall && c.continuous && totals.slice(0, c.continuous.threshold).every(over)) {
    alerts.push({ code: 'continuous', level: 'high', tip: c.continuous.tip_text,
      title: `${c.continuous.condition_name}: over ${overall.threshold} pieces for ${c.continuous.threshold} weeks in a row` });
  } else if (overall && over(total)) {
    alerts.push({ code: 'high_overall', level: 'warning', tip: overall.tip_text,
      title: `${overall.condition_name}: ${total} pieces this week (limit ${overall.threshold})` });
  }

  const share = c.category_share;
  if (share) {
    breakdown.forEach((b) => {
      if (b.pieces < share.min_pieces || b.pieces * 100 < share.threshold * total) return;
      const pk = packaging.find((p) => p.packaging_id === b.packaging_id);
      alerts.push({ code: 'category_share', level: 'warning', packaging_name: b.packaging_name,
        title: `${share.condition_name}: ${b.packaging_name} is ${b.percent}% of your plastic waste this week`,
        effects: String(pk.effects || '').split('\n').map((e) => e.trim()).filter(Boolean),
        tip: pk.tip_text || share.tip_text });
    });
  }

  // Compared with last week (only when last week had enough pieces to compare)
  const change = previous ? Math.round(((total - previous) / previous) * 100) : 0;
  const comparable = (cond) => cond && previous > 0 && previous >= cond.min_pieces;
  if (comparable(c.increase) && total * 100 >= previous * (100 + c.increase.threshold)) {
    alerts.push({ code: 'increase', level: 'warning', tip: c.increase.tip_text,
      title: `${c.increase.condition_name}: up ${change}% from last week (${previous} → ${total} pieces)` });
  }
  if (comparable(c.reduction) && total * 100 <= previous * (100 - c.reduction.threshold)) {
    alerts.push({ code: 'reduction', level: 'positive', tip: c.reduction.tip_text,
      title: `${c.reduction.condition_name}: down ${-change}% from last week (${previous} → ${total} pieces)` });
  }

  return { week_total: total, previous_week_total: previous, breakdown, alerts };
}

async function ecoTips(canteenId) {
  const [conds] = await pool.query('SELECT condition_code, condition_name, threshold, min_pieces, tip_text FROM conditions');
  const continuous = conds.find((x) => x.condition_code === 'continuous');
  const weeks = Math.max(2, continuous ? continuous.threshold : 0);
  const [packaging] = await pool.query(
    `SELECT pk.packaging_id, pk.packaging_name, t.effects, t.tip_text
     FROM packaging_category pk LEFT JOIN eco_tip t ON t.packaging_id = pk.packaging_id
     ORDER BY pk.packaging_id`
  );
  const [rows] = await pool.query(
    `SELECT FLOOR(DATEDIFF(CURDATE(), DATE(s.sold_at)) / 7) AS wk, p.packaging_id,
            SUM(s.quantity_sold) AS pieces
     FROM sales_record s JOIN product p ON p.product_id = s.product_id
     WHERE p.canteen_id = ? AND s.sold_at >= CURDATE() - INTERVAL ? DAY
       AND s.sold_at < CURDATE() + INTERVAL 1 DAY
     GROUP BY wk, p.packaging_id`,
    [canteenId, weeks * 7 - 1]
  );
  return evaluate(conds, packaging, rows.map((r) => ({ ...r, wk: Number(r.wk) })));
}

module.exports = { evaluate, ecoTips };
```

---

## Step 5: Tests

Node has a built-in test runner, so no new packages are needed. These tests check every rule, including the edge cases.

1. Create **`wasteless-backend/src/eco-tip.test.js`**:

```js
// Run: npm test   (checks the Eco-Tip rules without a database)
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('./eco-tip');

const conds = [
  { condition_code: 'high_overall', condition_name: 'High Overall Waste', threshold: 90, min_pieces: 0, tip_text: 'overall' },
  { condition_code: 'category_share', condition_name: 'High Category Share', threshold: 40, min_pieces: 20, tip_text: 'generic' },
  { condition_code: 'increase', condition_name: 'Increasing Plastic Waste', threshold: 10, min_pieces: 20, tip_text: 'up' },
  { condition_code: 'continuous', condition_name: 'Continuous High Usage', threshold: 2, min_pieces: 0, tip_text: 'cont' },
  { condition_code: 'reduction', condition_name: 'Reduction Observed', threshold: 10, min_pieces: 20, tip_text: 'down' }
];
const packaging = [
  { packaging_id: 1, packaging_name: 'Tetra Pak', effects: 'A\nB', tip_text: 'dispenser' },
  { packaging_id: 2, packaging_name: 'Wrapper', effects: null, tip_text: null }
];
const codes = (r) => r.alerts.map((a) => a.code);

test('quiet week: no alerts', () => {
  // 50% each, but only 15 pieces each (< 20), same total as last week
  const r = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 15 }, { wk: 0, packaging_id: 2, pieces: 15 },
    { wk: 1, packaging_id: 1, pieces: 30 }]);
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.week_total, 30);
});

test('category share needs 40% AND 20 pieces', () => {
  const r = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 20 }, { wk: 0, packaging_id: 2, pieces: 30 },
    { wk: 1, packaging_id: 1, pieces: 50 }]);
  // 20/50 = 40% (counts, exactly at threshold), 30/50 = 60%
  assert.deepStrictEqual(codes(r), ['category_share', 'category_share']);
  assert.deepStrictEqual(r.alerts[0].effects, ['A', 'B']);
  assert.strictEqual(r.alerts[1].tip, 'generic'); // no tip for that category -> generic tip
  assert.strictEqual(r.breakdown[0].percent, 40);
});

test('over the limit this week only -> high_overall; two weeks -> continuous instead', () => {
  const once = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 45 }, { wk: 0, packaging_id: 2, pieces: 45 },
    { wk: 1, packaging_id: 1, pieces: 85 }]);
  assert.deepStrictEqual(codes(once).filter((c) => c !== 'category_share'), ['high_overall']);
  const twice = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 90 }, { wk: 1, packaging_id: 1, pieces: 95 }]);
  assert.deepStrictEqual(codes(twice).filter((c) => c !== 'category_share'), ['continuous']);
});

test('increase / reduction compare with last week (needs 20+ pieces last week)', () => {
  const up = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 11 }, { wk: 0, packaging_id: 2, pieces: 11 },
    { wk: 1, packaging_id: 1, pieces: 20 }]);
  assert.deepStrictEqual(codes(up), ['increase']); // 22 vs 20 = +10%
  const down = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 9 }, { wk: 0, packaging_id: 2, pieces: 9 },
    { wk: 1, packaging_id: 1, pieces: 20 }]);
  assert.deepStrictEqual(codes(down), ['reduction']); // 18 vs 20 = -10%
  assert.strictEqual(down.alerts[0].level, 'positive');
  const tooSmall = evaluate(conds, packaging, [{ wk: 0, packaging_id: 1, pieces: 5 }, { wk: 1, packaging_id: 1, pieces: 19 }]);
  assert.deepStrictEqual(codes(tooSmall), []);
});

test('no sales at all', () => {
  const r = evaluate(conds, packaging, []);
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.breakdown[0].percent, 0);
});
```

2. Open `wasteless-backend/package.json`. In `"scripts"`, **find**:

```json
    "dev": "node --watch src/server.js"
```

**Replace with** (mind the comma):

```json
    "dev": "node --watch src/server.js",
    "test": "node --test src/*.test.js"
```

3. Run it in the terminal (inside `wasteless-backend`):

```
npm.cmd test
```

You should see `pass 5` and `fail 0`. If a test fails, the message shows which rule is wrong.

---

## Step 6: Vendor route

`/api/stall` already requires a logged-in vendor (see `server.js`), so this route only needs to call `ecoTips()` with the vendor's own stall.

Open `wasteless-backend/src/routes/stall.js`.

1. **Find:**

```js
const { rangeDays, lastDays, packagingLines } = require('../packaging-graph');
```

**Add below it:**

```js
const { ecoTips } = require('../eco-tip');
```

2. **Add this just above** the last line `module.exports = router;`:

```js
// GET /api/stall/eco-tips -> this week's plastic waste + the Eco-Tip alerts that apply
//   { week_total, previous_week_total, breakdown: [{ packaging_name, pieces, percent }],
//     alerts: [{ code, level: 'high'|'warning'|'positive', title, tip, effects? }] }
router.get('/eco-tips', wrap(async (req, res) => {
  res.json(await ecoTips(req.canteenId));
}));
```

**Check it:** restart the server, log in as a vendor in the browser (e.g. `bea@demo.local` / `demo123`), then open http://localhost:3000/api/stall/eco-tips. You should see JSON with `week_total`, `breakdown` and `alerts`.

---

## Step 7: Admin routes

Four routes for the admin's Eco-Tips tab. `/api/admin` already requires an admin login. The checks stop bad values (e.g. 150% or 2.5), and the error text is a full sentence because the admin page shows it in an alert.

Open `wasteless-backend/src/routes/admin.js` and **add this just above** the last line `module.exports = router;`:

```js
// ---------- Eco-Tip Management (thresholds + tips) ----------
const UNITS = { high_overall: 'pieces / week', category_share: '% of the week', increase: '% more than last week',
  continuous: 'weeks in a row', reduction: '% less than last week' };
const PERCENT_MAX = { category_share: 100, reduction: 100 }; // can't be over 100%

router.get('/eco/conditions', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM conditions ORDER BY condition_id');
  res.json(rows.map((r) => ({ ...r, unit: UNITS[r.condition_code] || '' })));
}));

router.put('/eco/conditions/:id', wrap(async (req, res) => {
  required(req.body, ['threshold', 'tip_text']);
  const [[cond]] = await pool.query('SELECT condition_code FROM conditions WHERE condition_id = ?', [req.params.id]);
  if (!cond) throw new HttpError(404, 'Condition not found');
  const threshold = Number(req.body.threshold);
  const minPieces = Number(req.body.min_pieces ?? 0);
  const max = PERCENT_MAX[cond.condition_code] || 100000;
  const errors = {};
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > max) errors.threshold = `Threshold must be a whole number from 1 to ${max}`;
  if (!Number.isInteger(minPieces) || minPieces < 0) errors.min_pieces = 'Min. pieces must be a whole number, 0 or more';
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors).join('. ') + '.', errors);
  await pool.query('UPDATE conditions SET threshold = ?, min_pieces = ?, tip_text = ? WHERE condition_id = ?',
    [threshold, minPieces, String(req.body.tip_text).trim(), req.params.id]);
  res.json({ condition_id: Number(req.params.id) });
}));

// One row per packaging category (tip fields empty if it has no tip yet)
router.get('/eco/tips', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pk.packaging_id, pk.packaging_name, t.effects, t.tip_text
     FROM packaging_category pk LEFT JOIN eco_tip t ON t.packaging_id = pk.packaging_id
     ORDER BY pk.packaging_id`
  );
  res.json(rows);
}));

router.put('/eco/tips/:packagingId', wrap(async (req, res) => {
  required(req.body, ['tip_text']);
  const [[pk]] = await pool.query('SELECT packaging_id FROM packaging_category WHERE packaging_id = ?', [req.params.packagingId]);
  if (!pk) throw new HttpError(404, 'Packaging category not found');
  await pool.query(
    `INSERT INTO eco_tip (packaging_id, condition_id, effects, tip_text)
     VALUES (?, (SELECT condition_id FROM conditions WHERE condition_code = 'category_share'), ?, ?)
     ON DUPLICATE KEY UPDATE effects = VALUES(effects), tip_text = VALUES(tip_text)`,
    [pk.packaging_id, String(req.body.effects ?? '').trim() || null, String(req.body.tip_text).trim()]
  );
  res.json({ packaging_id: pk.packaging_id });
}));
```

**Check it:** restart the server, log in as admin (`admin@wasteless.local` / `admin123`), open http://localhost:3000/api/admin/eco/conditions. You should see the 5 conditions, each with a `unit`.

---

## Step 8: API helper

Open `wasteless-backend/public/js/api.js`. **Find:**

```js
    getReportStatus: () => request('GET', '/api/stall/report/status'),
```

**Add below it:**

```js
    // Eco-Tip pop-up: { week_total, previous_week_total, breakdown, alerts }
    getEcoTips: () => request('GET', '/api/stall/eco-tips'),
```

---

## Step 9: Vendor page HTML

The banner gets ids so the script can change its text, plus a "View Eco-Tips" button. The pop-up is a `<dialog>`, like the Add Product pop-up.

Open `system.html/vendor-page.html`. **Find** the banner at the end of the Dashboard page:

```html
            <!-- Eco Tip Banner -->
            <aside class="eco-tip-banner">
              <strong>EcoTip 101</strong>
              <span
                >Every item sold leaves plastic behind. Check which packaging
                category your stall uses most, and look for products with less
                of it.</span
              >
            </aside>
          </div>
```

**Replace it with:**

```html
            <!-- Eco Tip Banner (the text changes when an Eco-Tip applies; "positive" class = waste went down) -->
            <aside class="eco-tip-banner" id="ecoTipBanner">
              <strong>EcoTip 101</strong>
              <span id="ecoTipBannerText"
                >Every item sold leaves plastic behind. Check which packaging
                category your stall uses most, and look for products with less
                of it.</span
              >
              <button type="button" id="ecoTipOpenBtn" class="btn outline btn-sm" hidden>
                View Eco-Tips
              </button>
            </aside>

            <!-- Eco-Tip pop-up: opens on every dashboard visit while a condition is reached -->
            <dialog class="eco-tip-modal" id="ecoTipDialog" aria-labelledby="ecoTipTitle">
              <h2 id="ecoTipTitle">Eco-Tip</h2>
              <section id="ecoTipSummary">
                <h3>This Week's Plastic Waste (last 7 days)</h3>
                <p>Total: <strong id="ecoTipTotal">0</strong> pieces</p>
                <ul id="ecoTipBreakdown"></ul>
              </section>
              <div id="ecoTipAlerts"></div>
              <button type="button" id="ecoTipCloseBtn" class="btn primary">Got it</button>
            </dialog>
          </div>
```

---

## Step 10: Vendor page script

Open `system.js/vendor-page.js`. Three changes:

1. **Show the pop-up on every dashboard visit.** In `function showPage()`, **find:**

```js
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showPage);
```

**Replace with:**

```js
  window.scrollTo(0, 0);
  if (page === "dashboard") loadEcoTips().catch(console.error); // pop-up on every dashboard visit
}
window.addEventListener("hashchange", showPage);
```

2. **Load and draw the Eco-Tips.** **Find:**

```js
// ---------- Download Report (PDF, once every 7 days) ----------
```

**Add this just above it:**

```js
// ---------- Eco-Tip pop-up ----------
// The backend checks the rules (admin page > Eco-Tips) against the last 7 days of sales.
// Warnings open the pop-up; "Reduction Observed" (positive) only changes the banner.
let defaultBannerText = null;

async function loadEcoTips() {
  const data = await WasteLessAPI.getEcoTips();
  const warnings = data.alerts.filter(a => a.level !== "positive");
  const positive = data.alerts.find(a => a.level === "positive");

  const banner = document.getElementById("ecoTipBanner");
  const bannerText = document.getElementById("ecoTipBannerText");
  const openBtn = document.getElementById("ecoTipOpenBtn");
  if (bannerText) {
    if (defaultBannerText === null) defaultBannerText = bannerText.textContent;
    bannerText.textContent = positive ? positive.title + ". " + positive.tip
      : warnings.length ? `Your stall has ${warnings.length} Eco-Tip warning(s) this week.` : defaultBannerText;
  }
  if (banner) banner.classList.toggle("positive", Boolean(positive));
  if (openBtn) openBtn.hidden = !warnings.length;

  document.getElementById("ecoTipTotal").textContent = data.week_total;
  document.getElementById("ecoTipBreakdown").innerHTML = data.breakdown.map(b =>
    `<li>${escapeHtml(b.packaging_name)}: <strong>${b.pieces}</strong> pieces (${b.percent}%)</li>`).join("");
  document.getElementById("ecoTipTitle").textContent = warnings.length ? "WARNING: " + warnings[0].title : "Eco-Tip";
  document.getElementById("ecoTipAlerts").innerHTML = warnings.map(a => `
    <section class="eco-alert ${a.level}">
      <h3>${a.level === "high" ? "HIGH PRIORITY: " : ""}${escapeHtml(a.title)}</h3>
      ${a.effects && a.effects.length ? `<p>Negative community and environmental effects:</p>
        <ul>${a.effects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
      <p class="eco-tip-text"><strong>Eco-Tip:</strong> ${escapeHtml(a.tip)}</p>
    </section>`).join("");

  const dialog = document.getElementById("ecoTipDialog");
  const onDashboard = !document.getElementById("page-dashboard").hidden; // still there when the data arrives
  if (warnings.length && onDashboard && !dialog.open) dialog.showModal();
}
```

Every value put into `innerHTML` goes through `escapeHtml()`, so an admin can't inject HTML through a tip.

3. **Buttons.** In `function setupEventListeners()`, **find:**

```js
  // Graph range dropdown (7 / 14 / 30 days)
```

**Add this just above it:**

```js
  // Eco-Tip pop-up buttons
  const ecoTipDialog = document.getElementById("ecoTipDialog");
  const ecoTipCloseBtn = document.getElementById("ecoTipCloseBtn");
  const ecoTipOpenBtn = document.getElementById("ecoTipOpenBtn");
  if (ecoTipCloseBtn) ecoTipCloseBtn.addEventListener("click", () => ecoTipDialog.close());
  if (ecoTipOpenBtn) ecoTipOpenBtn.addEventListener("click", () => ecoTipDialog.showModal());
```

---

## Step 11: Admin page HTML

Open `system.html/admin-page.html`. Three changes:

1. **Sidebar button.** **Find:**

```html
            <button type="button" data-section="categories" data-title="Packaging Category Management">Packaging Category</button>
```

**Add below it:**

```html
            <button type="button" data-section="eco" data-title="Eco-Tip Management">Eco-Tips</button>
```

2. **The Eco-Tips page.** **Find** the line `     </main>` and **add this just above it:**

```html
          <!-- eco-tips: the rules that open the vendor's Eco-Tip pop-up, and the tip per packaging category -->
           <section id="section-eco" class="page" hidden>
            <h2>Conditions</h2>
            <p>Plastic waste = pieces sold in the last 7 days (1 item sold = 1 piece).</p>
            <table border="1">
                <thead>
                    <tr>
                        <th>Condition</th>
                        <th>Threshold</th>
                        <th>Min. Pieces</th>
                        <th>Eco-Tip</th>
                        <th>Action/Edit</th>
                    </tr>
                </thead>
                <tbody id="condition-table-body"></tbody>
            </table>

            <h2>Tips per Packaging Category</h2>
            <p>Shown when a category reaches the "High Category Share" condition.</p>
            <table border="1">
                <thead>
                    <tr>
                        <th>Packaging Category</th>
                        <th>Negative Effects</th>
                        <th>Eco-Tip</th>
                        <th>Action/Edit</th>
                    </tr>
                </thead>
                <tbody id="ecotip-table-body"></tbody>
            </table>
          </section>
```

3. **The two edit pop-ups.** **Find** the line `    <footer>` and **add this just above it:**

```html
     <dialog id="condition-dialog">
        <form id="condition-form">
            <h2>Edit Condition</h2>
            <input type="hidden" name="condition_id">
            <p><label>Condition <input type="text" name="condition_name" readonly></label></p>
            <p><label>Threshold <input type="number" name="threshold" min="1" step="1" required></label>
               <span id="condition-form-unit"></span></p>
            <p><label>Min. Pieces <input type="number" name="min_pieces" min="0" step="1" required></label></p>
            <p><label>Eco-Tip <textarea name="tip_text" rows="4" maxlength="500" required></textarea></label></p>
            <button type="submit">Save</button>
            <button type="button" data-action="close-dialog">Cancel</button>
        </form>
     </dialog>

     <dialog id="ecotip-dialog">
        <form id="ecotip-form">
            <h2>Edit Eco-Tip</h2>
            <input type="hidden" name="packaging_id">
            <p><label>Packaging Category <input type="text" name="packaging_name" readonly></label></p>
            <p><label>Negative Effects (one per line) <textarea name="effects" rows="5" maxlength="1000"></textarea></label></p>
            <p><label>Eco-Tip <textarea name="tip_text" rows="4" maxlength="500" required></textarea></label></p>
            <button type="submit">Save</button>
            <button type="button" data-action="close-dialog">Cancel</button>
        </form>
     </dialog>
```

---

## Step 12: Admin page script

Open `system.js/admin-page.js`. This reuses the helpers already there: `openForm()`, `handleFormSubmit()` (sends PUT because the hidden id is filled), `listenToTableClicks()`, `findById()`, `escapeHtml()`. Six changes:

1. **Find** `let allCategories = []; // ALL categories (used by the dropdowns)` and **add below it:**

```js
let currentConditions = [];
let currentEcoTips = [];
```

2. **Find** `// Dropdown lists need ALL categories and ALL stalls (not the searched/filtered ones)` and **add this just above it:**

```js
function loadEcoTips() {
  api("GET", "/api/admin/eco/conditions").then(renderConditions).catch(showApiError);
  api("GET", "/api/admin/eco/tips").then(renderEcoTips).catch(showApiError);
}
```

3. **Find** `// "categories" here = packaging categories (Tetra Pak, Polystyrene, ...)` and **add this just above it:**

```js
// Text with line breaks (e.g. the effects) -> lines in the table cell
function multiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderConditions(conditions) {
  currentConditions = conditions;
  let rows = "";
  conditions.forEach(function (c) {
    rows += `<tr>
      <td>${escapeHtml(c.condition_name)}</td>
      <td>${escapeHtml(c.threshold)} ${escapeHtml(c.unit)}</td>
      <td>${escapeHtml(c.min_pieces)}</td>
      <td>${escapeHtml(c.tip_text)}</td>
      <td><button type="button" data-action="edit" data-id="${escapeHtml(c.condition_id)}">Edit</button></td>
    </tr>`;
  });
  byId("condition-table-body").innerHTML = rows;
}

function renderEcoTips(tips) {
  currentEcoTips = tips;
  let rows = "";
  tips.forEach(function (t) {
    rows += `<tr>
      <td>${escapeHtml(t.packaging_name)}</td>
      <td>${multiline(t.effects)}</td>
      <td>${t.tip_text ? escapeHtml(t.tip_text) : "(no tip yet: the general tip is used)"}</td>
      <td><button type="button" data-action="edit" data-id="${escapeHtml(t.packaging_id)}">Edit</button></td>
    </tr>`;
  });
  byId("ecotip-table-body").innerHTML = rows;
}
```

4. **Find:**

```js
handleFormSubmit("category-form", "packaging_id", "/api/admin/packaging", loadCategories);
```

**Replace with** (a packaging change also refreshes the Eco-Tips tables):

```js
handleFormSubmit("category-form", "packaging_id", "/api/admin/packaging", function () { loadCategories(); loadEcoTips(); });
handleFormSubmit("condition-form", "condition_id", "/api/admin/eco/conditions", loadEcoTips); // edit only
handleFormSubmit("ecotip-form", "packaging_id", "/api/admin/eco/tips", loadEcoTips); // edit only
```

5. In `listenToTableClicks("category-table-body", ...)`, **find:**

```js
    deleteRecord("/api/admin/packaging/" + id, loadCategories);
  }
});
```

**Replace with:**

```js
    deleteRecord("/api/admin/packaging/" + id, function () { loadCategories(); loadEcoTips(); });
  }
});

listenToTableClicks("condition-table-body", {
  edit: function (id) {
    const condition = findById(currentConditions, "condition_id", id);
    openForm("condition-form", condition);
    byId("condition-form-unit").textContent = condition.unit;
  }
});

listenToTableClicks("ecotip-table-body", {
  edit: function (id) {
    openForm("ecotip-form", findById(currentEcoTips, "packaging_id", id));
  }
});
```

6. At the very bottom, **find:**

```js
loadCategories();
loadDropdownOptions();
```

**Replace with:**

```js
loadCategories();
loadEcoTips();
loadDropdownOptions();
```

---

## Step 13: Test everything

1. `npm.cmd test` → `pass 5`, `fail 0`.
2. Restart the server, open http://localhost:3000, press **F12 → Console** on each page: there should be no red errors.

**See the pop-up with the demo data.** The demo sales stop on the day `demo-data.sql` was loaded, so "this week" may be nearly empty, and the stalls may just get the positive banner (or nothing). Add temporary sales for Tita Bea today in phpMyAdmin → `wasteless` → SQL. They use **50** per sale, so they're easy to find and remove later (demo sales are only 1 to 6):

```sql
INSERT INTO sales_record (product_id, quantity_sold, unit_price, sold_at)
SELECT product_id, 50, unit_price, NOW() FROM product WHERE product_name IN ('Yakult', 'Cup Noodles');
```

Log in as `bea@demo.local` / `demo123`, then check:
- [ ] The pop-up opens with "WARNING: High Overall Waste …", the weekly summary, and a Polystyrene section with 3 effects + its tip (plus "Increasing" if last week had 20+ pieces).
- [ ] "Got it" closes it. The banner says how many warnings there are and shows **View Eco-Tips**, which opens it again.
- [ ] Clicking **Product Listing** doesn't open it; clicking **Dashboard** again does.

Log in as admin and open **Eco-Tips**:
- [ ] Both tables show 5 rows. Edit **High Overall Waste** → change 90 to 200 → Save. Back as Bea, the "High Overall Waste" section is gone. Set it back to 90.
- [ ] Edit **High Category Share** → 150 → Save: you get "Threshold must be a whole number from 1 to 100." and nothing is saved.
- [ ] Edit a packaging tip → Save: the table shows the new text.

Security:
- [ ] As a vendor, http://localhost:3000/api/admin/eco/conditions says "Only admin accounts can do this".

**Remove the test sales** when done. This deletes only today's sales of exactly 50, so the demo sales stay:

```sql
DELETE FROM sales_record WHERE quantity_sold = 50 AND sold_at >= CURDATE();
```

Run it once, then check that `SELECT COUNT(*) FROM sales_record;` is still in the thousands.

---

## Step 14: Docs, commit and pull request

1. **README.md** (root): under "After pulling new code from GitHub", add: if the database was made before 2026-10-19 (no Eco-Tips tab), run `wasteless-backend/database/migrate-eco-tip.sql` once in phpMyAdmin.
2. **wasteless-backend/README.md**: add the 5 new routes to the API table (`GET /api/stall/eco-tips`, `GET /api/admin/eco/conditions`, `PUT /api/admin/eco/conditions/:id`, `GET /api/admin/eco/tips`, `PUT /api/admin/eco/tips/:packaging_id`), and replace "Eco-Tip logic comes later" in "Not done yet".
3. **FRONTEND-GUIDE.md**: add the new ids so the CM doesn't break them: vendor page `ecoTipBanner`, `ecoTipBannerText`, `ecoTipOpenBtn`, `ecoTipDialog`, `ecoTipTitle`, `ecoTipSummary`, `ecoTipTotal`, `ecoTipBreakdown`, `ecoTipAlerts`, `ecoTipCloseBtn` and classes `eco-alert`, `warning`, `high`, `eco-tip-text`, `positive`; admin page `data-section="eco"`, `section-eco`, `condition-table-body`, `ecotip-table-body`, `condition-dialog` / `condition-form` (fields `condition_id`, `condition_name`, `threshold`, `min_pieces`, `tip_text`, plus `condition-form-unit`) and `ecotip-dialog` / `ecotip-form` (fields `packaging_id`, `packaging_name`, `effects`, `tip_text`).
4. Commit and push:
   ```
   git add .
   git commit -m "Eco-Tip pop-up and admin Eco-Tips tab"
   git push -u origin eco-tip
   ```
   (Check `git status` first: don't commit `.env`, `PROGRESS.md` or `.claude/`.)
5. On GitHub, open a **pull request** from `eco-tip` into `main`, and ask someone to review it before merging.

---

## Why the rules differ from the PDF

The PDF review found these problems. The rules above already fix them:

1. **"≥ 20% of weekly waste from one category" always triggers.** With 5 categories, at least one is always ≥ 20%. → Raised to **40% and at least 20 pieces**.
2. **"≥ 50% overall" has no "of what".** There's no "weekly capacity" in the system. → Replaced by a **weekly limit in pieces** (90).
3. **The sample scenario breaks its own rules.** It shows warnings for Tetra Pak at 14.7% (under 20%), skips Lid / Cap at 70% (should trigger), and names the category "Plastic Lid / Cap / Other Packaging".
4. **The section 5 formula (×2 for Tetra Pak / PS, ×3 for containers) doesn't match the "share" rule.** "Total Pieces" isn't defined, the weights can push a percentage over 100%, and the sample doesn't use them. → **Dropped** (every piece counts as 1).
5. **Page 1 and section 4 list different conditions.** Per-product 20%, "30% sachet products" (there's no sachet category; sachets are Plastic Wrapper) and "≥ 50 stock deducted" are only on page 1. → **Left out**; add later if the team needs them.
6. **Small numbers give silly percentages** (1 item = 100%; 0 last week = can't compute a change). → **Minimum pieces** added.
7. **"Week" and "2+ weeks of what" were vague.** → Defined in Part A.

The PDF's own note still applies: the numbers are only triggers for helpful tips, not environmental standards or penalties.
