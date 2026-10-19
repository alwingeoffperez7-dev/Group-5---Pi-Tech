# Eco-Tip: Build Guide for the Backend Team

This is the plan for the **Eco-Tip pop-up**: a warning shown to a vendor on their dashboard when their plastic waste reaches a set condition, with a tip on how to reduce it.

The rules come from the team's **Condition_Tip.pdf**. The PDF was reviewed and some rules were fixed, because they could not be coded or always triggered (see [Why the rules differ from the PDF](#why-the-rules-differ-from-the-pdf)). **Build the rules in this guide, not the raw PDF.**

Read the root [README.md](README.md) first to get the project running.

---

## 1. What it does (in one paragraph)

Every time a vendor opens the **Dashboard**, the server checks that stall's plastic waste for the **last 7 days** against 5 conditions. If any **warning** condition is reached, a pop-up opens with: a warning heading, this week's waste summary per packaging category, and one section per warning with its tip (plus "bad effects" for category warnings). If waste **went down**, the dashboard's EcoTip banner shows a positive message instead (no pop-up). The pop-up keeps showing on every dashboard visit for as long as the condition holds. The **admin** can change every threshold and tip from a new **Eco-Tips** tab.

---

## 2. Definitions (use these exactly)

| Term | Meaning |
|---|---|
| **Piece** | 1 item sold = 1 piece of plastic waste. Each product has one `packaging_id`, so a sale counts toward that packaging category. |
| **Plastic waste** | Pieces sold, from `sales_record.quantity_sold` joined to `product.packaging_id`. Same data as the dashboard graph. |
| **This week** (week 0) | The last 7 days, **today included**: `sold_at >= CURDATE() - INTERVAL 6 DAY`. |
| **Last week** (week 1) | The 7 days before that. Week number of a sale: `FLOOR(DATEDIFF(CURDATE(), DATE(sold_at)) / 7)`. |
| **Share** | A category's pieces this week ÷ the stall's total pieces this week × 100. |
| **Change** | (this week − last week) ÷ last week × 100. |

Ignore sales with `sold_at` in the future (`sold_at < CURDATE() + INTERVAL 1 DAY`).

---

## 3. The 5 conditions (final rules)

Defaults below. **All numbers are stored in the database** so the admin can change them; never hard-code them.

| # | Code | Name | Rule | Level | Shows |
|---|---|---|---|---|---|
| 1 | `high_overall` | High Overall Waste | this week's total **≥ 90** pieces | warning | pop-up section + general tip |
| 2 | `category_share` | High Category Share | a category's share **≥ 40%** **and** that category has **≥ 20** pieces this week | warning | pop-up section **per category** + that category's bad effects + its tip |
| 3 | `increase` | Increasing Plastic Waste | change **≥ +10%**, only if last week had **≥ 20** pieces | warning | pop-up section + tip |
| 4 | `continuous` | Continuous High Usage | rule 1 reached in **each of the last 2** weeks (this week and last week) | high | **replaces** rule 1's section, shown first |
| 5 | `reduction` | Reduction Observed | change **≤ −10%**, only if last week had **≥ 20** pieces | positive | banner text only, **no pop-up** |

Rule details that are easy to get wrong:
- **Compare with whole numbers** to avoid rounding mistakes: share rule = `pieces * 100 >= threshold * total`; increase = `total * 100 >= previous * (100 + threshold)`; reduction = `total * 100 <= previous * (100 - threshold)`. Exactly 40% **counts**.
- Rule 4's "2 weeks" is its own threshold (admin can make it 3). It uses rule 1's 90 as the limit for each week.
- When rule 4 is reached, **don't** also show rule 1.
- Rules 3 and 5 are skipped when last week had 0 pieces or fewer than 20 (no division by zero, no "+300%" from 2 → 8 pieces).
- A stall with no sales gets no alerts and 0% everywhere.
- Rule 2 can trigger for more than one category at once (e.g. 50% / 50%).
- If a packaging category has no tip of its own yet (e.g. the admin just added it), use rule 2's general tip.

**Why 90?** The demo stalls (`demo-data.sql`) average about 70 pieces/week, and their busiest week is about 105. At 90, a warning shows in roughly 1 out of 10 weeks; at 80 it would be about 1 in 3.

---

## 4. Database changes

The tables `conditions`, `eco_tip` and `notification` already exist in `schema.sql` (from the ERD) but are **empty and unused**, and they were designed for sales/revenue amounts and **food** categories. Change them to:

**`conditions`**: one row per rule

| Column | Type | Notes |
|---|---|---|
| `condition_id` | INT PK auto | |
| `condition_code` | VARCHAR(30) NOT NULL UNIQUE | `high_overall`, `category_share`, `increase`, `continuous`, `reduction`. The code looks rules up by this, so it's never edited. |
| `condition_name` | VARCHAR(120) NOT NULL | shown to users |
| `threshold` | INT NOT NULL | pieces (rule 1), % (rules 2, 3, 5), weeks (rule 4) |
| `min_pieces` | INT NOT NULL DEFAULT 0 | the "≥ 20 pieces" part (rules 2, 3, 5) |
| `tip_text` | VARCHAR(500) NOT NULL | |

(Removes the old `total_sold` / `total_revenue` columns.)

**`eco_tip`**: the tip and bad effects per **packaging** category

| Column | Type | Notes |
|---|---|---|
| `tip_id` | INT PK auto | |
| `packaging_id` | INT NOT NULL UNIQUE | FK → `packaging_category`, **ON DELETE CASCADE** (so deleting a category in the admin page still works) |
| `condition_id` | INT NULL | FK → `conditions` (the `category_share` row) |
| `effects` | VARCHAR(1000) | one effect per line (`\n` between them) |
| `tip_text` | VARCHAR(500) NOT NULL | |

(Replaces the old `category_id` → food category.)

**`notification`**: keep as it is. It isn't needed, because tips are checked live on every visit.

Files to change:
1. `wasteless-backend/database/schema.sql`: the new table definitions (keep the comment style there).
2. `wasteless-backend/database/seed.sql`: insert the default rows below (match `eco_tip` to `packaging_category` by **name**, not by a hard-coded id).
3. **New** `wasteless-backend/database/migrate-eco-tip.sql` for teammates who already have a database: `DROP TABLE IF EXISTS notification, eco_tip, conditions;`, then the same CREATE TABLEs + inserts. Safe, because those tables were empty. Follow the header style of `migrate.sql`.

### Default rows

**conditions**

| code | name | threshold | min_pieces | tip_text |
|---|---|---|---|---|
| high_overall | High Overall Waste | 90 | 0 | Reduce single-use items where you can, and work with suppliers that offer less or more sustainable packaging. |
| category_share | High Category Share | 40 | 20 | Look for products in this category that come with less packaging, or offer an alternative. |
| increase | Increasing Plastic Waste | 10 | 20 | Check which products caused the increase and whether they have lower-packaging alternatives. |
| continuous | Continuous High Usage | 2 | 0 | Review your packaging options and talk to your suppliers about alternatives that create less plastic waste. |
| reduction | Reduction Observed | 10 | 20 | Great job! Keep up the practices that are reducing your plastic waste. |

**eco_tip** (from the PDF's "Community Impact Matrix")

| Packaging | Effects (one per line) | Tip |
|---|---|---|
| Tetra Pak | Difficult to recycle: bonded paper, plastic, and aluminum layers are hard to separate. / Persistent litter: does not easily degrade when trapped in streets or drainage systems, causing pooling and blockages. | Offer beverages using bulk dispensers with reusable cups, or encourage students to bring their own tumblers. |
| Polystyrene (PS) | Easily fragmented into microplastics: breaks down into tiny particles that spread into air and water. / Chemical leaching: can release styrene chemicals when exposed to heat. / Drainage blockage: floating foam cups easily clog waterways. | Switch to paper-based or biodegradable containers for snacks and soups. |
| Plastic Container | High landfill volume: bulky containers quickly fill up waste bins and landfills. / Vector breeding ground: containers left outdoors fill with rainwater and can become breeding sites for mosquitoes. | Start a "Bring Your Own Container" (BYOC) incentive, or use washable, reusable containers inside the canteen. |
| Plastic Wrapper | Primary cause of clogged channels: light and thin, so wind and water easily carry them into drainage systems. / Wildlife hazard: easily swallowed by campus animals and local wildlife. | Offer bulk or family-sized snacks for portioning, or promote packaging-free options like traditional local delicacies. |
| Plastic Lid / Cap | Choking hazard: small enough to be swallowed by stray animals or birds. / Separated from recyclables: often detached from bottles and missed during recycling sorting. | Provide a dedicated "Cap Collection Bin" so small closures can be kept together for recycling programs. |

("/" above = a new line in the `effects` column.)

---

## 5. Backend code

Follow the patterns already in the project: `wrap()` for async routes, `HttpError` for errors, `required()` in `admin.js`, placeholders (`?`) in every query, and `requireRole` is already applied to `/api/stall` (vendor) and `/api/admin` (admin) in `server.js`, so new routes under them are protected automatically.

### 5a. Rule logic: new file `src/eco-tip.js`

Split it in two so it can be tested without a database:
- `evaluate(conditions, packaging, rows)`: **pure function**, no SQL. `rows` = `[{ wk, packaging_id, pieces }]`. Returns the result below.
- `ecoTips(canteenId)`: runs the 3 queries (conditions; packaging categories LEFT JOIN eco_tip; pieces per week per packaging for this stall, covering `max(2, continuous threshold)` weeks) and calls `evaluate`.

Result shape (the front end depends on it):

```json
{
  "week_total": 101,
  "previous_week_total": 57,
  "breakdown": [
    { "packaging_id": 2, "packaging_name": "Polystyrene (PS)", "pieces": 87, "percent": 86.1 }
  ],
  "alerts": [
    { "code": "high_overall", "level": "warning", "title": "High Overall Waste: 101 pieces this week (limit 90)", "tip": "..." },
    { "code": "category_share", "level": "warning", "packaging_name": "Polystyrene (PS)",
      "title": "High Category Share: Polystyrene (PS) is 86.1% of your plastic waste this week",
      "effects": ["Easily fragmented into microplastics: ...", "..."], "tip": "Switch to paper-based ..." },
    { "code": "increase", "level": "warning", "title": "Increasing Plastic Waste: up 77% from last week (57 → 101 pieces)", "tip": "..." }
  ]
}
```

- `breakdown` lists **every** packaging category (0 pieces included), `percent` rounded to 1 decimal.
- `level` is `high` (rule 4), `warning` (rules 1–3) or `positive` (rule 5).
- Alert order: rule 4 or rule 1 first, then rule 2 (category order), then rule 3, then rule 5.

### 5b. Routes

| Method & URL | File | Who | Does |
|---|---|---|---|
| `GET /api/stall/eco-tips` | `routes/stall.js` | vendor | `res.json(await ecoTips(req.canteenId))` |
| `GET /api/admin/eco/conditions` | `routes/admin.js` | admin | all conditions + a `unit` text per code (`pieces / week`, `% of the week`, `% more than last week`, `weeks in a row`, `% less than last week`) |
| `PUT /api/admin/eco/conditions/:id` | `routes/admin.js` | admin | update `threshold`, `min_pieces`, `tip_text` (not code/name) |
| `GET /api/admin/eco/tips` | `routes/admin.js` | admin | every packaging category LEFT JOIN eco_tip (empty tip = none yet) |
| `PUT /api/admin/eco/tips/:packaging_id` | `routes/admin.js` | admin | insert or update that category's `effects` + `tip_text` (`INSERT ... ON DUPLICATE KEY UPDATE`) |

Validation (400 with `{ error, details }` like the other routes):
- `threshold`: whole number ≥ 1; **≤ 100** for `category_share` and `reduction` (they're percentages that can't go over 100). `increase` may be over 100.
- `min_pieces`: whole number ≥ 0.
- `tip_text`: required, max 500 characters. `effects`: optional, max 1000.
- Unknown condition id / packaging id → 404.
- The admin page shows only `err.message` in an alert, so make `error` say what's wrong (e.g. "Threshold must be a whole number from 1 to 100.").

Also add to `public/js/api.js`: `getEcoTips: () => request('GET', '/api/stall/eco-tips')`.

### 5c. Test

Add `src/eco-tip.test.js` using Node's built-in runner (no new packages) and a script in `package.json`: `"test": "node --test src/*.test.js"`. Run with `npm.cmd test`. It must cover at least the cases in [section 7](#7-test-cases-must-pass).

---

## 6. Front end (do with / hand to the front-end member)

Plain HTML, no CSS needed (see [FRONTEND-GUIDE.md](FRONTEND-GUIDE.md)). Keep everything that already exists.

**Vendor page** (`system.html/vendor-page.html` + `system.js/vendor-page.js`)
- Give the existing banner `<aside class="eco-tip-banner">` an `id="ecoTipBanner"`, its `<span>` an `id="ecoTipBannerText"`, and add a hidden `<button id="ecoTipOpenBtn">View Eco-Tips</button>`.
- Add `<dialog id="ecoTipDialog">` inside `#page-dashboard` with: `<h2 id="ecoTipTitle">`, a summary (`#ecoTipTotal`, `<ul id="ecoTipBreakdown">`), `<div id="ecoTipAlerts">`, and `<button id="ecoTipCloseBtn">Got it</button>`.
- `loadEcoTips()`: call `WasteLessAPI.getEcoTips()`, then:
  - fill the summary; one `<section class="eco-alert {level}">` per **non-positive** alert with `<h3>` title, effects `<ul>` if any, `<p class="eco-tip-text"><strong>Eco-Tip:</strong> …</p>`;
  - heading = `"WARNING: " + first warning's title`;
  - banner text: positive alert → its title + tip (add class `positive`); warnings → "Your stall has N Eco-Tip warning(s) this week."; none → the original text;
  - open the dialog with `showModal()` only if there are warnings **and** the dashboard page is still visible.
- Call `loadEcoTips()` from `showPage()` when the page is `dashboard`, so it runs on **every** dashboard visit (page load and sidebar clicks).
- Use the existing `escapeHtml()` for every value put into `innerHTML`.

**Admin page** (`system.html/admin-page.html` + `system.js/admin-page.js`)
- Sidebar: `<button type="button" data-section="eco" data-title="Eco-Tip Management">Eco-Tips</button>`, and a `<section id="section-eco" class="page" hidden>`.
- Two tables: **Conditions** (`#condition-table-body`: Condition, Threshold + unit, Min. Pieces, Eco-Tip, Edit) and **Tips per Packaging Category** (`#ecotip-table-body`: Packaging Category, Negative Effects, Eco-Tip, Edit).
- Two edit-only dialogs: `#condition-dialog` / `#condition-form` (hidden `condition_id`, read-only `condition_name`, `threshold`, `min_pieces`, `tip_text`) and `#ecotip-dialog` / `#ecotip-form` (hidden `packaging_id`, read-only `packaging_name`, `effects` textarea, `tip_text`).
- Reuse what's already there: `openForm()`, `handleFormSubmit()` (it sends PUT because the hidden id is filled), `listenToTableClicks()`, `findById()`, `escapeHtml()`. Show effects lines with `<br>`.
- After a packaging category is added, edited or deleted, reload the Eco-Tips tables too.

Then add the new ids to **FRONTEND-GUIDE.md** so the CM doesn't break them.

---

## 7. Test cases (must pass)

Unit tests on `evaluate()` with the default rules:

| This week (per category) | Last week | Expected alerts |
|---|---|---|
| A 15, B 15 | 30 | none (50% each but < 20 pieces) |
| A 20, B 30 | 50 | `category_share` ×2 (40% counts; 60%) |
| A 45, B 45 | 85 | `high_overall` (+ 2× category_share) |
| A 90 | 95 | `continuous` (not `high_overall`) + category_share |
| A 11, B 11 | 20 | `increase` only (+10%) |
| A 9, B 9 | 20 | `reduction` only (−10%), level `positive` |
| A 5 | 19 | none (last week < 20) |
| nothing | nothing | none, all percents 0 |

Also check by hand:
- [ ] Vendor can't open `/api/admin/eco/...` (403); logged-out user gets 401.
- [ ] Admin threshold 150 for High Category Share → 400; 2.5 → 400; min pieces −1 → 400.
- [ ] Changing the limit from 90 to 120 in the admin tab changes what the vendor sees right away.
- [ ] Deleting a packaging category (with no products) still works.
- [ ] Fresh install (`schema.sql` + `seed.sql`) and the migration on an existing database both give 5 conditions + 5 tips.

**Trying it with the demo data:** the demo sales stop on 2026-10-15, so "this week" may be almost empty, and all stalls just get the positive banner. To see the pop-up, add temporary sales for Tita Bea today, check, then delete them:

```sql
SELECT MAX(sale_id) FROM sales_record;   -- remember this number
INSERT INTO sales_record (product_id, quantity_sold, unit_price, sold_at)
SELECT product_id, 50, unit_price, NOW() FROM product WHERE product_name IN ('Yakult', 'Cup Noodles');
-- log in as bea@demo.local / demo123 -> Dashboard: expect High Overall + Polystyrene share
-- (+ Increasing, if last week had 20+ pieces)
DELETE FROM sales_record WHERE sale_id > <the number you remembered>;
```

---

## 8. Suggested split

| Who | Task | Needs |
|---|---|---|
| Person 1 | Section 4: schema, seed, migration | nothing |
| Person 2 | Section 5a + 5c: `eco-tip.js` + tests | the result shape (can start right away with fake rows) |
| Person 3 | Section 5b: the 5 routes + `api.js` | Person 1 |
| Person 4 / CM | Section 6: vendor pop-up + admin tab, FRONTEND-GUIDE.md | Person 3 (or use the JSON example above until the routes exist) |

Workflow as usual: make a branch (e.g. `eco-tip`), push, open a pull request, and update the READMEs (add `migrate-eco-tip.sql` to "After pulling new code" and the new routes to `wasteless-backend/README.md`).

---

## Why the rules differ from the PDF

The PDF review found these problems. The rules above already fix them:

1. **"≥ 20% of weekly waste from one category" always triggers.** With 5 categories, at least one is always ≥ 20%. → Raised to **40% and at least 20 pieces**.
2. **"≥ 50% overall" has no "of what".** There's no "weekly capacity" in the system. → Replaced by a **weekly limit in pieces** (90).
3. **The sample scenario doesn't follow its own rules.** It shows warnings for Tetra Pak at 14.7% (under 20%), skips Lid / Cap at 70% (should trigger), and names the category "Plastic Lid / Cap / Other Packaging".
4. **The section 5 formula (×2 for Tetra Pak / PS, ×3 for containers) doesn't match the "share" rule.** "Total Pieces" isn't defined, the weights can push a percentage over 100%, and the sample doesn't use them. → **Dropped** (every piece counts as 1).
5. **Page 1 and section 4 list different conditions.** Per-product 20%, "30% sachet products" (there's no sachet category; it's under Plastic Wrapper) and "≥ 50 stock deducted" are only on page 1. → **Left out**; add later if the team needs them.
6. **Small numbers give silly percentages** (1 item = 100%; 0 last week = can't compute a change). → **Minimum pieces** added.
7. **"Week" and "2+ weeks of what" were vague.** → Defined in sections 2 and 3.

The PDF's threshold note still applies: the numbers are only triggers for helpful tips, not environmental standards or penalties.
