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