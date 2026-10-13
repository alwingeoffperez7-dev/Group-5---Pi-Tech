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

-- Sample vendor account (password_hash is a placeholder until login is built)
INSERT INTO staff (canteen_id, full_name, email, password_hash, role)
VALUES (1, 'Juan Dela Cruz', 'juan@example.com', 'CHANGE_ME', 'vendor');
