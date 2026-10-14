-- Starter data so the vendor page has something to show.
-- Run after schema.sql:  mysql -u root -p wasteless < database/seed.sql
USE wasteless;

INSERT INTO category (category_name, description) VALUES
  ('Meals',    'Rice meals and viands'),
  ('Snacks',   'Chips, bread, and small bites'),
  ('Drinks',   'Bottled and cup drinks'),
  ('Desserts', 'Sweets and cold treats');

-- Sample stall (canteen_id = 1). Replace with your real vendors.
INSERT INTO canteen (business_name, business_email, contact_person, contact_email, contact_number, location)
VALUES ('Sample Stall', 'stall@example.com', 'Juan Dela Cruz', 'juan@example.com', '09171234567', 'QCU Coop, Stall 1');

-- Test logins (dev only — change before real use):
--   Vendor: juan@example.com      / vendor123
--   Admin:  admin@wasteless.local / admin123
INSERT INTO staff (canteen_id, full_name, email, password_hash, role) VALUES
  (1, 'Juan Dela Cruz', 'juan@example.com', '59ebb65c714fce8453f68baf89df98e7:fb494b5144831aace8b5c314ec6eed05c4b20ba4b29bd08cfb9e1c7626edd8a9725b9151f89cd0b1146dc1f961ce45341a92ed07673ea4bbe5798866ed1f9c15', 'vendor'),
  (NULL, 'Coop Admin', 'admin@wasteless.local', '93bd0e8b98f5bf5d063b8b405324a71c:5b1f7aa004cac319103500e194606a2911fd52b5ccc82c28f873765f90f679ac3556d7abe87c11888815a463eff561257e03bc5b802d811d0c5fb88e01bb6802', 'admin');
