-- =====================================================================
-- DEMO DATA (optional): 3 vendor stalls, 15 products, 1 year of sales.
-- Fills the vendor dashboard graph and the landing page graph so they
-- can be shown in a presentation. Sales are random each time you load it.
--
-- Load:   mysql -u root wasteless < database/demo-data.sql
-- (run after schema.sql + seed.sql, or migrate-packaging.sql)
--
-- Demo logins (Log In as Vendor), password for all: demo123
--   rosa@demo.local   Kusina ni Aling Rosa   (meals)
--   bea@demo.local    Tita Bea's Snack Corner (snacks)
--   kape@demo.local   Kape't Tinapay          (drinks + desserts)
--
-- Remove it again: see the "REMOVE DEMO DATA" block at the bottom.
-- =====================================================================
USE wasteless;

-- ---------- Stalls + vendor logins ----------
INSERT INTO canteen (business_name, business_email, contact_person, contact_number, location, status) VALUES
  ('Kusina ni Aling Rosa',    'rosa@demo.local', 'Rosa Santos',   '09171110001', 'QCU Coop, Stall 2', 'Approved'),
  ('Tita Bea''s Snack Corner', 'bea@demo.local',  'Bea Reyes',     '09171110002', 'QCU Coop, Stall 3', 'Approved'),
  ('Kape''t Tinapay',          'kape@demo.local', 'Marco Villanueva', '09171110003', 'QCU Coop, Stall 4', 'Approved');

-- password: demo123
INSERT INTO staff (canteen_id, full_name, email, password_hash, role)
SELECT canteen_id, contact_person, business_email,
       '8bcdc6466008074bec38a950a250af7d:536e09f9498c79f24997b699758d2baf31234e3278063c42e48671dc557ea19339001eecf4a85dc141a61136a5f001d0aa4e1e74f7f1573cd220d8567703cf87',
       'vendor'
FROM canteen WHERE business_email IN ('rosa@demo.local', 'bea@demo.local', 'kape@demo.local');

-- ---------- Products (stall email, name, description, food category, packaging, price, stock) ----------
CREATE TEMPORARY TABLE demo_product (
  stall_email VARCHAR(120), product_name VARCHAR(120), description VARCHAR(500),
  category_name VARCHAR(60), packaging_name VARCHAR(60), unit_price DECIMAL(10,2), stock INT
);
INSERT INTO demo_product VALUES
  ('rosa@demo.local', 'Chicken Adobo',        'Rice meal with chicken adobo, take-out',  'Meals',    'Plastic Container', 75.00, 30),
  ('rosa@demo.local', 'Pancit Canton',        'Stir-fried noodles, take-out container',   'Meals',    'Plastic Container', 55.00, 25),
  ('rosa@demo.local', 'Arroz Caldo',          'Rice porridge in a foam cup',              'Meals',    'Polystyrene (PS)',  45.00, 20),
  ('rosa@demo.local', 'Bottled Water',        '500 ml bottle',                            'Drinks',   'Plastic Lid / Cap', 20.00, 60),
  ('rosa@demo.local', 'Turon',                'Banana spring roll, wrapped',              'Desserts', 'Plastic Wrapper',   15.00, 40),
  ('bea@demo.local',  'Potato Chips',         'Small pack',                               'Snacks',   'Plastic Wrapper',   25.00, 50),
  ('bea@demo.local',  'Cream Biscuit',        'Single pack',                              'Snacks',   'Plastic Wrapper',   12.00, 80),
  ('bea@demo.local',  'Zest-O Juice',         '200 ml juice drink',                       'Drinks',   'Tetra Pak',         15.00, 70),
  ('bea@demo.local',  'Yakult',               'Probiotic drink',                          'Drinks',   'Polystyrene (PS)',  12.00, 45),
  ('bea@demo.local',  'Cup Noodles',          'Instant noodles in a cup',                 'Meals',    'Polystyrene (PS)',  35.00, 30),
  ('kape@demo.local', 'Iced Coffee',          'Plastic cup with a lid',                   'Drinks',   'Plastic Lid / Cap', 60.00, 40),
  ('kape@demo.local', 'Chocolate Milk',       '250 ml carton',                            'Drinks',   'Tetra Pak',         25.00, 50),
  ('kape@demo.local', 'Leche Flan',           'Single serving tub',                       'Desserts', 'Plastic Container', 40.00, 20),
  ('kape@demo.local', 'Ensaymada',            'Bread, individually wrapped',              'Snacks',   'Plastic Wrapper',   30.00, 35),
  ('kape@demo.local', 'Hot Chocolate',        'Foam cup',                                 'Drinks',   'Polystyrene (PS)',  35.00, 25);

INSERT INTO product (canteen_id, category_id, packaging_id, product_name, description, unit_price, stock)
SELECT c.canteen_id, cat.category_id, pk.packaging_id, d.product_name, d.description, d.unit_price, d.stock
FROM demo_product d
JOIN canteen c             ON c.business_email = d.stall_email
JOIN category cat          ON cat.category_name = d.category_name
JOIN packaging_category pk ON pk.packaging_name = d.packaging_name;

-- Stock history starts at the stock above (same as adding the product on the vendor page)
INSERT INTO stocklog (product_id, log_type, stock_before, stock_after, notes)
SELECT p.product_id, 'initial', 0, p.stock, 'Demo data'
FROM product p JOIN canteen c ON c.canteen_id = p.canteen_id
WHERE c.business_email IN ('rosa@demo.local', 'bea@demo.local', 'kape@demo.local');

-- ---------- Sales: each product, each day of the past year (about 60% of days) ----------
CREATE TEMPORARY TABLE demo_digit (d INT);
INSERT INTO demo_digit VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

INSERT INTO sales_record (product_id, quantity_sold, unit_price, sold_at)
SELECT p.product_id,
       1 + FLOOR(RAND() * 6),                                         -- 1 to 6 sold
       p.unit_price,
       CURDATE() - INTERVAL days.n DAY + INTERVAL (8 + FLOOR(RAND() * 9)) HOUR  -- between 8am and 4pm
FROM (SELECT a.d * 100 + b.d * 10 + c.d AS n FROM demo_digit a, demo_digit b, demo_digit c) days
JOIN product p
JOIN canteen ca ON ca.canteen_id = p.canteen_id
WHERE days.n < 365
  AND ca.business_email IN ('rosa@demo.local', 'bea@demo.local', 'kape@demo.local')
  AND RAND() < 0.6;

DROP TEMPORARY TABLE demo_product;
DROP TEMPORARY TABLE demo_digit;

-- =====================================================================
-- REMOVE DEMO DATA (copy these lines into phpMyAdmin → SQL, or the mysql prompt)
-- =====================================================================
-- DELETE s FROM sales_record s JOIN product p ON p.product_id = s.product_id JOIN canteen c ON c.canteen_id = p.canteen_id WHERE c.business_email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
-- DELETE l FROM stocklog l JOIN product p ON p.product_id = l.product_id JOIN canteen c ON c.canteen_id = p.canteen_id WHERE c.business_email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
-- DELETE f FROM feedback f JOIN canteen c ON c.canteen_id = f.canteen_id WHERE c.business_email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
-- DELETE p FROM product p JOIN canteen c ON c.canteen_id = p.canteen_id WHERE c.business_email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
-- DELETE FROM staff WHERE email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
-- DELETE FROM canteen WHERE business_email IN ('rosa@demo.local','bea@demo.local','kape@demo.local');
