-- Run ONCE on a database made before 2026-10-15 (before plastic packaging
-- categories and the weekly PDF report existed):
--   mysql -u root wasteless < database/migrate.sql
-- Fresh installs don't need this: schema.sql + seed.sql already include it.
--
-- 1) Replaces product.packaging_type (Plastic/Paper/Reusable) with packaging_id.
--    Existing products are set to "Plastic Container"; vendors can change it by editing.
-- 2) Adds report_download (one PDF report per stall every 7 days).
USE wasteless;

CREATE TABLE packaging_category (
  packaging_id    INT AUTO_INCREMENT PRIMARY KEY,
  packaging_name  VARCHAR(60) NOT NULL UNIQUE,
  description     VARCHAR(500),
  example         VARCHAR(255)
);

INSERT INTO packaging_category (packaging_name, description, example) VALUES
  ('Tetra Pak', 'Multi-layered cartons made of paperboard, plastic, and aluminum foil, commonly used to package shelf-stable liquids like juice, milk, and broth.', 'Zest-O'),
  ('Polystyrene (PS)', 'Light, rigid, or foam plastic frequently used for disposable coffee cups, takeout clamshells, foam packaging, and plastic cutlery.', 'Yakult, Cup of Instant Noodles'),
  ('Plastic Container', 'Rigid plastic tubs, bottles, jars, and clamshells designed to hold food, liquids, or household products.', 'Container ng take-out ng Pancit Canton'),
  ('Plastic Wrapper', 'Soft, flexible plastic film or bags used to wrap individual products, snack foods, grocery items, or multi-packs.', 'Chips, Biscuit, Sachet'),
  ('Plastic Lid / Cap', 'Small, rigid plastic closures from bottles, jars, and tubs designed to seal container openings.', NULL);

ALTER TABLE product ADD COLUMN packaging_id INT NULL AFTER description;
UPDATE product SET packaging_id = (SELECT packaging_id FROM packaging_category WHERE packaging_name = 'Plastic Container');
ALTER TABLE product
  MODIFY packaging_id INT NOT NULL,
  ADD FOREIGN KEY (packaging_id) REFERENCES packaging_category(packaging_id),
  DROP COLUMN packaging_type;

CREATE TABLE report_download (
  download_id    INT AUTO_INCREMENT PRIMARY KEY,
  canteen_id     INT NOT NULL,
  staff_id       INT NULL,
  downloaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canteen_id) REFERENCES canteen(canteen_id),
  FOREIGN KEY (staff_id)   REFERENCES staff(staff_id),
  INDEX idx_report_canteen (canteen_id, downloaded_at)
);
