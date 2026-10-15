// Admin page (system.html/admin-page.html). Field names match the render
// functions in system.js/admin-page.js.
// List routes take ?search=&filter=&sort= straight from getListOptions().
const express = require('express');
const pool = require('../db');
const { HttpError, wrap } = require('../middleware');

const router = express.Router();

const like = (s) => `%${s}%`;
const pickSort = (sort, map, fallback) => map[sort] || map[fallback];
const NAME_SORT = (col, dateCol) => ({
  name_asc: `${col} ASC`, name_desc: `${col} DESC`, newest: `${dateCol} DESC`, oldest: `${dateCol} ASC`
});

function required(body, fields) {
  const errors = {};
  fields.forEach((f) => { if (!String(body[f] ?? '').trim()) errors[f] = 'This field is required'; });
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fill in the required fields', errors);
}

// ---------- Dashboard ----------
router.get('/stats', wrap(async (req, res) => {
  const [[stats]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM canteen WHERE status = 'Approved') AS total_stalls,
            (SELECT COUNT(*) FROM packaging_category) AS total_categories,
            (SELECT COUNT(*) FROM product WHERE is_active = 1) AS total_products`
  );
  res.json(stats);
}));

// ?sort=newest|oldest
router.get('/feedback', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT f.feedback_id, f.subject, f.message, f.feedback_type, f.status, f.created_at,
            c.business_name
     FROM feedback f JOIN canteen c ON c.canteen_id = f.canteen_id
     ORDER BY f.created_at ${req.query.sort === 'oldest' ? 'ASC' : 'DESC'}, f.feedback_id`
  );
  res.json(rows.map((r) => ({ ...r, tags: [r.feedback_type, r.status, r.business_name] })));
}));

// ---------- Account Management (vendor sign-ups) ----------
// filter = Pending | Approved | Declined (empty = all)
router.get('/accounts', wrap(async (req, res) => {
  const { search, filter, sort } = req.query;
  const where = [`c.status <> 'Removed'`];
  const params = [];
  if (filter) { where.push('c.status = ?'); params.push(filter); }
  if (search) {
    where.push('(c.business_name LIKE ? OR s.email LIKE ? OR c.contact_person LIKE ?)');
    params.push(like(search), like(search), like(search));
  }
  const [rows] = await pool.query(
    `SELECT c.canteen_id AS account_id, c.business_name, s.email, c.contact_person,
            c.contact_number, c.status, c.joined_date
     FROM canteen c JOIN staff s ON s.canteen_id = c.canteen_id AND s.role = 'vendor'
     WHERE ${where.join(' AND ')}
     ORDER BY ${pickSort(sort, NAME_SORT('c.business_name', 'c.canteen_id'), 'newest')}`,
    params
  );
  res.json(rows);
}));

for (const [action, status] of [['approve', 'Approved'], ['decline', 'Declined']]) {
  router.post(`/accounts/:id/${action}`, wrap(async (req, res) => {
    const [r] = await pool.query(
      `UPDATE canteen SET status = ? WHERE canteen_id = ? AND status <> 'Removed'`, [status, req.params.id]
    );
    if (!r.affectedRows) throw new HttpError(404, 'Account not found');
    res.json({ account_id: Number(req.params.id), status });
  }));
}

// ---------- Stall Management ----------
router.get('/stalls', wrap(async (req, res) => {
  const { search, sort } = req.query;
  const where = [`status = 'Approved'`];
  const params = [];
  if (search) {
    where.push('(business_name LIKE ? OR contact_person LIKE ? OR business_email LIKE ?)');
    params.push(like(search), like(search), like(search));
  }
  const [rows] = await pool.query(
    `SELECT canteen_id AS stall_id, business_name, contact_person, contact_number,
            business_email AS email, location, joined_date
     FROM canteen WHERE ${where.join(' AND ')}
     ORDER BY ${pickSort(sort, NAME_SORT('business_name', 'canteen_id'), 'name_asc')}`,
    params
  );
  res.json(rows);
}));

const stallValues = (b) => [
  String(b.business_name).trim(), String(b.contact_person ?? '').trim() || null,
  String(b.contact_number ?? '').trim() || null, String(b.email ?? '').trim() || null
];

router.post('/stalls', wrap(async (req, res) => {
  required(req.body, ['business_name']);
  const [r] = await pool.query(
    `INSERT INTO canteen (business_name, contact_person, contact_number, business_email, status)
     VALUES (?, ?, ?, ?, 'Approved')`,
    stallValues(req.body)
  );
  res.status(201).json({ stall_id: r.insertId });
}));

router.put('/stalls/:id', wrap(async (req, res) => {
  required(req.body, ['business_name']);
  const [r] = await pool.query(
    `UPDATE canteen SET business_name = ?, contact_person = ?, contact_number = ?, business_email = ?
     WHERE canteen_id = ? AND status <> 'Removed'`,
    [...stallValues(req.body), req.params.id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Stall not found');
  res.json({ stall_id: Number(req.params.id) });
}));

// Soft delete: the stall's sales/feedback history stays; its login stops working.
router.delete('/stalls/:id', wrap(async (req, res) => {
  const [r] = await pool.query(
    `UPDATE canteen SET status = 'Removed' WHERE canteen_id = ? AND status <> 'Removed'`, [req.params.id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Stall not found');
  await pool.query('UPDATE product SET is_active = 0 WHERE canteen_id = ?', [req.params.id]);
  res.json({ deleted: true });
}));

// ---------- Product Management (all stalls) ----------
// filter = packaging_id
router.get('/products', wrap(async (req, res) => {
  const { search, filter, sort } = req.query;
  const where = ['p.is_active = 1'];
  const params = [];
  if (filter) { where.push('p.packaging_id = ?'); params.push(filter); }
  if (search) { where.push('p.product_name LIKE ?'); params.push(like(search)); }
  const [rows] = await pool.query(
    `SELECT p.product_id, p.product_name, p.packaging_id, pk.packaging_name,
            p.category_id, cat.category_name,
            p.canteen_id AS stall_id, c.business_name AS stall_name, p.unit_price, p.stock
     FROM product p
     JOIN canteen c ON c.canteen_id = p.canteen_id
     JOIN category cat ON cat.category_id = p.category_id
     JOIN packaging_category pk ON pk.packaging_id = p.packaging_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${pickSort(sort, NAME_SORT('p.product_name', 'p.created_at'), 'name_asc')}`,
    params
  );
  res.json(rows);
}));

async function checkProductRefs(body) {
  const checks = [
    ['packaging_id', 'SELECT 1 FROM packaging_category WHERE packaging_id = ?', 'Pick a valid packaging category'],
    ['category_id', 'SELECT 1 FROM category WHERE category_id = ?', 'Pick a valid category'],
    ['stall_id', `SELECT 1 FROM canteen WHERE canteen_id = ? AND status = 'Approved'`, 'Pick a valid stall']
  ];
  for (const [field, sql, message] of checks) {
    if (body[field] === undefined || body[field] === '') continue;
    const [r] = await pool.query(sql, [body[field]]);
    if (!r.length) throw new HttpError(400, message, { [field]: message });
  }
}

// Price/stock start at 0; the vendor fills them in from their own page.
router.post('/products', wrap(async (req, res) => {
  required(req.body, ['product_name', 'packaging_id', 'category_id', 'stall_id']);
  await checkProductRefs(req.body);
  const [r] = await pool.query(
    `INSERT INTO product (canteen_id, category_id, packaging_id, product_name, unit_price) VALUES (?, ?, ?, ?, 0)`,
    [req.body.stall_id, req.body.category_id, req.body.packaging_id, String(req.body.product_name).trim()]
  );
  res.status(201).json({ product_id: r.insertId });
}));

// Only the fields sent are changed (the row's packaging dropdown sends just packaging_id).
router.put('/products/:id', wrap(async (req, res) => {
  const cols = { product_name: 'product_name', packaging_id: 'packaging_id', category_id: 'category_id', stall_id: 'canteen_id' };
  const sent = Object.keys(cols).filter((k) => req.body[k] !== undefined && req.body[k] !== '');
  if (!sent.length) throw new HttpError(400, 'Nothing to update');
  await checkProductRefs(req.body);
  const [r] = await pool.query(
    `UPDATE product SET ${sent.map((k) => `${cols[k]} = ?`).join(', ')} WHERE product_id = ? AND is_active = 1`,
    [...sent.map((k) => (k === 'product_name' ? String(req.body[k]).trim() : req.body[k])), req.params.id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Product not found');
  res.json({ product_id: Number(req.params.id) });
}));

router.delete('/products/:id', wrap(async (req, res) => {
  const [r] = await pool.query('UPDATE product SET is_active = 0 WHERE product_id = ? AND is_active = 1', [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Product not found');
  res.json({ deleted: true });
}));

// ---------- Packaging Category Management (plastic packaging) ----------
router.get('/packaging', wrap(async (req, res) => {
  const { search, sort } = req.query;
  const sorts = {
    name_asc: 'pk.packaging_name ASC', name_desc: 'pk.packaging_name DESC',
    items_desc: 'item_count DESC', items_asc: 'item_count ASC'
  };
  const [rows] = await pool.query(
    `SELECT pk.packaging_id, pk.packaging_name, pk.description, pk.example, COUNT(p.product_id) AS item_count
     FROM packaging_category pk
     LEFT JOIN product p ON p.packaging_id = pk.packaging_id AND p.is_active = 1
     ${search ? 'WHERE pk.packaging_name LIKE ?' : ''}
     GROUP BY pk.packaging_id
     ORDER BY ${sorts[sort] || 'pk.packaging_id ASC'}`,
    search ? [like(search)] : []
  );
  res.json(rows);
}));

const packagingValues = (b) => [
  String(b.packaging_name).trim(),
  String(b.description ?? '').trim() || null,
  String(b.example ?? '').trim() || null
];

router.post('/packaging', wrap(async (req, res) => {
  required(req.body, ['packaging_name']);
  const [r] = await pool.query(
    'INSERT INTO packaging_category (packaging_name, description, example) VALUES (?, ?, ?)', packagingValues(req.body)
  );
  res.status(201).json({ packaging_id: r.insertId });
}));

router.put('/packaging/:id', wrap(async (req, res) => {
  required(req.body, ['packaging_name']);
  const [r] = await pool.query(
    'UPDATE packaging_category SET packaging_name = ?, description = ?, example = ? WHERE packaging_id = ?',
    [...packagingValues(req.body), req.params.id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Packaging category not found');
  res.json({ packaging_id: Number(req.params.id) });
}));

router.delete('/packaging/:id', wrap(async (req, res) => {
  const [[used]] = await pool.query('SELECT COUNT(*) AS n FROM product WHERE packaging_id = ? AND is_active = 1', [req.params.id]);
  if (used.n) throw new HttpError(400, `${used.n} product(s) still use this packaging category. Move them first.`);
  const [r] = await pool.query('DELETE FROM packaging_category WHERE packaging_id = ?', [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Packaging category not found');
  res.json({ deleted: true });
}));

module.exports = router;
