-- =====================================================================
-- WasteLess: Canteen Inventory and Plastic Waste Monitoring System
-- Database schema (MySQL 8 / MariaDB 10.5+)
-- Based on the ERD (2nd draft) + the Vendor Page wireframe.
-- Run: mysql -u root -p < database/schema.sql
-- =====================================================================

DROP DATABASE IF EXISTS wasteless;
CREATE DATABASE wasteless CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wasteless;

-- ---------------------------------------------------------------------
-- CANTEEN  (one row per vendor stall in the QCU Coop)
-- ERD fields + business_email / contact_email shown on "My Stall".
-- ---------------------------------------------------------------------
CREATE TABLE canteen (
  canteen_id      INT AUTO_INCREMENT PRIMARY KEY,
  business_name   VARCHAR(120) NOT NULL,
  business_email  VARCHAR(120),
  contact_person  VARCHAR(120),
  contact_email   VARCHAR(120),
  contact_number  VARCHAR(20),
  location        VARCHAR(120),
  joined_date     DATE NOT NULL DEFAULT (CURRENT_DATE)
);

-- ---------------------------------------------------------------------
-- STAFF  (people who log in for a canteen; "employs" relationship)
-- ---------------------------------------------------------------------
CREATE TABLE staff (
  staff_id       INT AUTO_INCREMENT PRIMARY KEY,
  canteen_id     INT NULL,                      -- NULL for coop admins
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('vendor','admin') NOT NULL DEFAULT 'vendor',
  FOREIGN KEY (canteen_id) REFERENCES canteen(canteen_id)
);

-- ---------------------------------------------------------------------
-- CATEGORY  (Meals, Snacks, Drinks, Desserts)
-- NOTE: the ERD puts packaging_type here, but the wireframe lets each
-- product pick its own packaging, so packaging_type lives on PRODUCT.
-- ---------------------------------------------------------------------
CREATE TABLE category (
  category_id    INT AUTO_INCREMENT PRIMARY KEY,
  category_name  VARCHAR(60) NOT NULL UNIQUE,
  description    VARCHAR(255)
);

-- ---------------------------------------------------------------------
-- PRODUCT  (the vendor's catalog)
-- ERD fields + description, packaging_type, stock, image_path from the
-- Add/Edit Product pop-up. is_active = soft delete, so old sales and
-- waste records still point at a real product.
-- ---------------------------------------------------------------------
CREATE TABLE product (
  product_id         INT AUTO_INCREMENT PRIMARY KEY,
  canteen_id         INT NOT NULL,
  category_id        INT NOT NULL,
  product_name       VARCHAR(120) NOT NULL,
  description        VARCHAR(500),
  packaging_type     ENUM('Plastic','Paper','Reusable') NOT NULL DEFAULT 'Plastic',
  unit               VARCHAR(30) NOT NULL DEFAULT 'pc',
  unit_price         DECIMAL(10,2) NOT NULL,
  stock              INT NOT NULL DEFAULT 0,
  reorder_threshold  INT NOT NULL DEFAULT 5,
  image_path         VARCHAR(255),
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_price CHECK (unit_price >= 0),
  CONSTRAINT chk_stock CHECK (stock >= 0),
  FOREIGN KEY (canteen_id)  REFERENCES canteen(canteen_id),
  FOREIGN KEY (category_id) REFERENCES category(category_id),
  INDEX idx_product_canteen (canteen_id, is_active)
);

-- ---------------------------------------------------------------------
-- STOCKLOG  (every stock change; the API writes one when stock changes)
-- ---------------------------------------------------------------------
CREATE TABLE stocklog (
  stocklog_id        INT AUTO_INCREMENT PRIMARY KEY,
  product_id         INT NOT NULL,
  staff_id           INT NULL,
  log_type           ENUM('initial','restock','adjustment','sale','waste') NOT NULL,
  stock_before       INT NOT NULL,
  stock_after        INT NOT NULL,
  quantity_consumed  INT NOT NULL DEFAULT 0,
  notes              VARCHAR(255),
  log_date           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES product(product_id),
  FOREIGN KEY (staff_id)   REFERENCES staff(staff_id)
);

-- ---------------------------------------------------------------------
-- WASTELOG  (plastic/packaging waste per product)
-- ---------------------------------------------------------------------
CREATE TABLE wastelog (
  wastelog_id      INT AUTO_INCREMENT PRIMARY KEY,
  product_id       INT NOT NULL,
  staff_id         INT NULL,
  log_type         VARCHAR(30),
  sachet_count     INT NOT NULL DEFAULT 0,
  weight_kg        DECIMAL(8,3) NOT NULL DEFAULT 0,
  disposal_method  VARCHAR(60),
  notes            VARCHAR(255),
  wastelog_date    DATE NOT NULL DEFAULT (CURRENT_DATE),
  log_date         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES product(product_id),
  FOREIGN KEY (staff_id)   REFERENCES staff(staff_id)
);

-- ---------------------------------------------------------------------
-- SALES_RECORD  (feeds Business Analytics — other members' part)
-- unit_price is copied at sale time so revenue stays right after a
-- price edit.
-- ---------------------------------------------------------------------
CREATE TABLE sales_record (
  sale_id        INT AUTO_INCREMENT PRIMARY KEY,
  product_id     INT NOT NULL,
  user_id        INT NULL,          -- staff who recorded the sale
  quantity_sold  INT NOT NULL,
  unit_price     DECIMAL(10,2) NOT NULL,
  sold_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES product(product_id),
  FOREIGN KEY (user_id)    REFERENCES staff(staff_id),
  INDEX idx_sales_date (sold_at)
);

-- ---------------------------------------------------------------------
-- FEEDBACK  (Feedback / Report page — not in the ERD yet, add it there)
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
  feedback_id      INT AUTO_INCREMENT PRIMARY KEY,
  canteen_id       INT NOT NULL,
  staff_id         INT NULL,
  feedback_type    ENUM('Inquiry','Report a Problem','Suggestion','Stall Info Change') NOT NULL,
  subject          VARCHAR(150) NOT NULL,
  message          TEXT NOT NULL,
  attachment_path  VARCHAR(255),
  status           ENUM('Pending','Replied','Resolved') NOT NULL DEFAULT 'Pending',
  admin_reply      TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (canteen_id) REFERENCES canteen(canteen_id),
  FOREIGN KEY (staff_id)   REFERENCES staff(staff_id)
);

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
  tip_id             INT AUTO_INCREMENT PRIMARY KEY,
  category_id        INT NULL,
  condition_id       INT NULL,
  tip_text           VARCHAR(500) NOT NULL,
  trigger_condition  VARCHAR(255),
  FOREIGN KEY (category_id)  REFERENCES category(category_id),
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

-- BUSINESS_ANALYTICS in the ERD holds values that can be computed from
-- sales_record (best_seller, total_sold, total_revenue), so it's a VIEW
-- instead of a table — no risk of the numbers going out of sync.
CREATE VIEW business_analytics AS
SELECT p.canteen_id,
       p.product_id,
       p.product_name,
       SUM(s.quantity_sold)                AS total_sold,
       SUM(s.quantity_sold * s.unit_price) AS total_revenue
FROM sales_record s
JOIN product p ON p.product_id = s.product_id
GROUP BY p.canteen_id, p.product_id, p.product_name;
