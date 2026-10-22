-- Starter data so the vendor page has something to show.
-- Run after schema.sql:  mysql -u root -p wasteless < database/seed.sql
USE wasteless;

INSERT INTO category (category_name, description) VALUES
  ('Meals',    'Rice meals and viands'),
  ('Snacks',   'Chips, bread, and small bites'),
  ('Drinks',   'Bottled and cup drinks'),
  ('Desserts', 'Sweets and cold treats');

INSERT INTO packaging_category (packaging_name, description, example) VALUES
  ('Tetra Pak', 'Multi-layered cartons made of paperboard, plastic, and aluminum foil, commonly used to package shelf-stable liquids like juice, milk, and broth.', 'Zest-O'),
  ('Polystyrene (PS)', 'Light, rigid, or foam plastic frequently used for disposable coffee cups, takeout clamshells, foam packaging, and plastic cutlery.', 'Yakult, Cup of Instant Noodles'),
  ('Plastic Container', 'Rigid plastic tubs, bottles, jars, and clamshells designed to hold food, liquids, or household products.', 'Container ng take-out ng Pancit Canton'),
  ('Plastic Wrapper', 'Soft, flexible plastic film or bags used to wrap individual products, snack foods, grocery items, or multi-packs.', 'Chips, Biscuit, Sachet'),
  ('Plastic Lid / Cap', 'Small, rigid plastic closures from bottles, jars, and tubs designed to seal container openings.', NULL);

-- Sample stall (canteen_id = 1). Replace with your real vendors.
INSERT INTO canteen (business_name, business_email, contact_person, contact_email, contact_number, location)
VALUES ('Sample Stall', 'stall@example.com', 'Juan Dela Cruz', 'juan@example.com', '09171234567', 'QCU Coop, Stall 1');

-- Test logins (dev only — change before real use):
--   Vendor: juan@example.com      / vendor123
--   Admin:  admin@wasteless.local / admin123
INSERT INTO staff (canteen_id, full_name, email, password_hash, role) VALUES
  (1, 'Juan Dela Cruz', 'juan@example.com', '59ebb65c714fce8453f68baf89df98e7:fb494b5144831aace8b5c314ec6eed05c4b20ba4b29bd08cfb9e1c7626edd8a9725b9151f89cd0b1146dc1f961ce45341a92ed07673ea4bbe5798866ed1f9c15', 'vendor'),
  (NULL, 'Coop Admin', 'admin@wasteless.local', '93bd0e8b98f5bf5d063b8b405324a71c:5b1f7aa004cac319103500e194606a2911fd52b5ccc82c28f873765f90f679ac3556d7abe87c11888815a463eff561257e03bc5b802d811d0c5fb88e01bb6802', 'admin');

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