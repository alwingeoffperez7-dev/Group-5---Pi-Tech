// Product Listing page: list, search, filter, add, edit (cell by cell), delete,
// and the Sold +/- buttons (record / undo a sale).
const express = require('express');
const pool = require('../db');
const { upload, HttpError, wrap, discardUpload } = require('../middleware');
const { rejectBottledWater } = require('../rules');

const router = express.Router();

// Columns the front end gets for each product.
// sold = pieces sold in the last 7 days, today included (same week as the dashboard and Eco-Tip).
const SELECT_PRODUCT = `
  SELECT p.product_id, p.canteen_id AS stall_id, c.business_name AS stall_name,
         p.product_name, p.description, p.category_id, cat.category_name,
         p.packaging_id, pk.packaging_name, p.unit, p.unit_price, p.stock, p.reorder_threshold,
         (SELECT COALESCE(SUM(s.quantity_sold), 0) FROM sales_record s
          WHERE s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY) AS sold,
         (p.stock <= p.reorder_threshold) AS is_low_stock,
         p.image_path, p.created_at, p.updated_at
  FROM product p
  JOIN canteen  c   ON c.canteen_id = p.canteen_id
  JOIN category cat ON cat.category_id = p.category_id
  JOIN packaging_category pk ON pk.packaging_id = p.packaging_id`;

function toJson(row) {
  return {
    ...row,
    sold: Number(row.sold),
    is_low_stock: Boolean(row.is_low_stock),
    image_url: row.image_path ? `/uploads/${row.image_path}` : null
  };
}

async function findProduct(conn, canteenId, productId) {
  const [rows] = await conn.query(
    `${SELECT_PRODUCT} WHERE p.product_id = ? AND p.canteen_id = ? AND p.is_active = 1`,
    [productId, canteenId]
  );
  return rows[0] || null;
}

// Category can come in as category_id (number) or category (name, e.g. "Meals").
async function resolveCategoryId(body) {
  if (body.category_id) {
    const [r] = await pool.query('SELECT category_id FROM category WHERE category_id = ?', [body.category_id]);
    return r[0] ? r[0].category_id : null;
  }
  if (body.category) {
    const [r] = await pool.query('SELECT category_id FROM category WHERE category_name = ?', [String(body.category).trim()]);
    return r[0] ? r[0].category_id : null;
  }
  return undefined; // not sent
}

// Check the Add/Edit form. `existing` is the current product when editing.
async function validate(body, existing) {
  const errors = {};
  const out = {};

  const name = body.product_name ?? body.name;
  if (name !== undefined || !existing) {
    out.product_name = String(name ?? '').trim();
    if (!out.product_name) errors.product_name = 'Product name is required';
    else if (out.product_name.length > 120) errors.product_name = 'Product name is too long (max 120)';
    else rejectBottledWater(out.product_name);
  }

  if (body.description !== undefined) {
    out.description = String(body.description).trim().slice(0, 500) || null;
  }

  const catId = await resolveCategoryId(body);
  if (catId !== undefined || !existing) {
    if (!catId) errors.category = 'Pick a valid category';
    else out.category_id = catId;
  }

  if (body.packaging_id !== undefined || !existing) {
    const [r] = await pool.query('SELECT packaging_id FROM packaging_category WHERE packaging_id = ?', [body.packaging_id ?? null]);
    if (!r[0]) errors.packaging_id = 'Pick a packaging category';
    else out.packaging_id = r[0].packaging_id;
  }

  const price = body.unit_price ?? body.price;
  if (price !== undefined || !existing) {
    const n = Number(price);
    if (price === undefined || price === '' || !Number.isFinite(n) || n < 0) errors.unit_price = 'Price must be a number 0 or higher';
    else out.unit_price = Math.round(n * 100) / 100;
  }

  if (body.stock !== undefined && body.stock !== '') {
    const n = Number(body.stock);
    if (!Number.isInteger(n) || n < 0) errors.stock = 'Stock must be a whole number 0 or higher';
    else out.stock = n;
  } else if (!existing) {
    out.stock = 0;
  }

  if (body.reorder_threshold !== undefined && body.reorder_threshold !== '') {
    const n = Number(body.reorder_threshold);
    if (!Number.isInteger(n) || n < 0) errors.reorder_threshold = 'Reorder threshold must be a whole number 0 or higher';
    else out.reorder_threshold = n;
  }

  if (body.unit !== undefined && String(body.unit).trim()) {
    out.unit = String(body.unit).trim().slice(0, 30);
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', errors);
  return out;
}

// GET /api/products?q=adobo&category=Meals
router.get('/', wrap(async (req, res) => {
  const where = ['p.canteen_id = ?', 'p.is_active = 1'];
  const params = [req.canteenId];

  if (req.query.q) {
    where.push('p.product_name LIKE ?');
    params.push(`%${req.query.q}%`);
  }
  if (req.query.category && req.query.category !== 'All') {
    where.push('cat.category_name = ?');
    params.push(req.query.category);
  }

  const [rows] = await pool.query(
    `${SELECT_PRODUCT} WHERE ${where.join(' AND ')} ORDER BY p.product_name`,
    params
  );
  res.json({ count: rows.length, products: rows.map(toJson) });
}));

// GET /api/products/:id   (fills the Edit pop-up)
router.get('/:id', wrap(async (req, res) => {
  const product = await findProduct(pool, req.canteenId, req.params.id);
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(toJson(product));
}));

// POST /api/products   (Add Product pop-up → "Save Product")
// Send as multipart/form-data (FormData) so an image can be attached.
router.post('/', upload.single('image'), wrap(async (req, res) => {
  let data;
  try {
    data = await validate(req.body, null);
  } catch (e) {
    discardUpload(req);
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO product (canteen_id, category_id, product_name, description, packaging_id,
                            unit, unit_price, stock, reorder_threshold, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.canteenId, data.category_id, data.product_name, data.description ?? null, data.packaging_id,
       data.unit ?? 'pc', data.unit_price, data.stock, data.reorder_threshold ?? 5,
       req.file ? req.file.filename : null]
    );
    await conn.query(
      `INSERT INTO stocklog (product_id, staff_id, log_type, stock_before, stock_after, notes)
       VALUES (?, ?, 'initial', 0, ?, 'Product added')`,
      [result.insertId, req.staffId, data.stock]
    );
    await conn.commit();

    const product = await findProduct(pool, req.canteenId, result.insertId);
    res.status(201).json(toJson(product));
  } catch (e) {
    await conn.rollback();
    discardUpload(req);
    throw e;
  } finally {
    conn.release();
  }
}));

// PUT /api/products/:id   (Edit Product pop-up → "Save Changes")
// Only the fields you send are changed.
router.put('/:id', upload.single('image'), wrap(async (req, res) => {
  const existing = await findProduct(pool, req.canteenId, req.params.id);
  if (!existing) { discardUpload(req); throw new HttpError(404, 'Product not found'); }

  let data;
  try {
    data = await validate(req.body, existing);
  } catch (e) {
    discardUpload(req);
    throw e;
  }
  if (req.file) data.image_path = req.file.filename;
  if (!Object.keys(data).length) return res.json(toJson(existing));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const cols = Object.keys(data);
    await conn.query(
      `UPDATE product SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE product_id = ? AND canteen_id = ?`,
      [...cols.map((c) => data[c]), existing.product_id, req.canteenId]
    );
    if (data.stock !== undefined && data.stock !== existing.stock) {
      await conn.query(
        `INSERT INTO stocklog (product_id, staff_id, log_type, stock_before, stock_after, notes)
         VALUES (?, ?, ?, ?, ?, 'Edited from Product Listing')`,
        [existing.product_id, req.staffId, data.stock > existing.stock ? 'restock' : 'adjustment',
         existing.stock, data.stock]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    discardUpload(req);
    throw e;
  } finally {
    conn.release();
  }

  const product = await findProduct(pool, req.canteenId, existing.product_id);
  res.json(toJson(product));
}));

// POST /api/products/:id/sales   (Sold "+" button)   body: { quantity } (default 1)
// Records a sale now and takes it out of stock. Can't sell more than is in stock.
router.post('/:id/sales', wrap(async (req, res) => {
  const quantity = req.body && req.body.quantity !== undefined ? Number(req.body.quantity) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new HttpError(400, 'Quantity must be a whole number from 1 to 1000');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query(
      'SELECT product_id, stock, unit_price FROM product WHERE product_id = ? AND canteen_id = ? AND is_active = 1 FOR UPDATE',
      [req.params.id, req.canteenId]
    );
    if (!p) throw new HttpError(404, 'Product not found');
    if (p.stock < quantity) throw new HttpError(400, `Not enough stock: only ${p.stock} left. Add stock first.`);
    await conn.query(
      'INSERT INTO sales_record (product_id, user_id, quantity_sold, unit_price) VALUES (?, ?, ?, ?)',
      [p.product_id, req.staffId, quantity, p.unit_price]
    );
    await conn.query('UPDATE product SET stock = stock - ? WHERE product_id = ?', [quantity, p.product_id]);
    await conn.query(
      `INSERT INTO stocklog (product_id, staff_id, log_type, stock_before, stock_after, notes)
       VALUES (?, ?, 'sale', ?, ?, 'Sold from Product Listing')`,
      [p.product_id, req.staffId, p.stock, p.stock - quantity]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.status(201).json(toJson(await findProduct(pool, req.canteenId, req.params.id)));
}));

// DELETE /api/products/:id/sales/last   (Sold "−" button)
// Undoes this product's most recent sale from TODAY (older sales are kept) and puts it back in stock.
router.delete('/:id/sales/last', wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query(
      'SELECT product_id, stock FROM product WHERE product_id = ? AND canteen_id = ? AND is_active = 1 FOR UPDATE',
      [req.params.id, req.canteenId]
    );
    if (!p) throw new HttpError(404, 'Product not found');
    const [[sale]] = await conn.query(
      `SELECT sale_id, quantity_sold FROM sales_record
       WHERE product_id = ? AND sold_at >= CURDATE() ORDER BY sold_at DESC, sale_id DESC LIMIT 1`,
      [p.product_id]
    );
    if (!sale) throw new HttpError(400, 'No sale of this product today to undo.');
    await conn.query('DELETE FROM sales_record WHERE sale_id = ?', [sale.sale_id]);
    await conn.query('UPDATE product SET stock = stock + ? WHERE product_id = ?', [sale.quantity_sold, p.product_id]);
    await conn.query(
      `INSERT INTO stocklog (product_id, staff_id, log_type, stock_before, stock_after, notes)
       VALUES (?, ?, 'adjustment', ?, ?, 'Sale undone from Product Listing')`,
      [p.product_id, req.staffId, p.stock, p.stock + sale.quantity_sold]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.json(toJson(await findProduct(pool, req.canteenId, req.params.id)));
}));

// DELETE /api/products/:id   (Delete pop-up → "Delete")
// Soft delete: the row stays so sales/waste history still works.
router.delete('/:id', wrap(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE product SET is_active = 0 WHERE product_id = ? AND canteen_id = ? AND is_active = 1',
    [req.params.id, req.canteenId]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Product not found');
  res.json({ deleted: true, product_id: Number(req.params.id) });
}));

module.exports = router;
