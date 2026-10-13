// Product Listing page: list, search, filter, add, edit, delete.
const express = require('express');
const pool = require('../db');
const { upload, HttpError, wrap, discardUpload } = require('../middleware');

const router = express.Router();
const PACKAGING = ['Plastic', 'Paper', 'Reusable'];

// Columns the front end gets for each product.
const SELECT_PRODUCT = `
  SELECT p.product_id, p.canteen_id AS stall_id, c.business_name AS stall_name,
         p.product_name, p.description, p.category_id, cat.category_name,
         p.packaging_type, p.unit, p.unit_price, p.stock, p.reorder_threshold,
         (p.stock <= p.reorder_threshold) AS is_low_stock,
         p.image_path, p.created_at, p.updated_at
  FROM product p
  JOIN canteen  c   ON c.canteen_id = p.canteen_id
  JOIN category cat ON cat.category_id = p.category_id`;

function toJson(row) {
  return {
    ...row,
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
  }

  if (body.description !== undefined) {
    out.description = String(body.description).trim().slice(0, 500) || null;
  }

  const catId = await resolveCategoryId(body);
  if (catId !== undefined || !existing) {
    if (!catId) errors.category = 'Pick a valid category';
    else out.category_id = catId;
  }

  const pack = body.packaging_type ?? body.packaging;
  if (pack !== undefined || !existing) {
    out.packaging_type = pack === undefined ? 'Plastic' : String(pack);
    if (!PACKAGING.includes(out.packaging_type)) errors.packaging_type = 'Packaging must be Plastic, Paper, or Reusable';
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
      `INSERT INTO product (canteen_id, category_id, product_name, description, packaging_type,
                            unit, unit_price, stock, reorder_threshold, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.canteenId, data.category_id, data.product_name, data.description ?? null, data.packaging_type,
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
