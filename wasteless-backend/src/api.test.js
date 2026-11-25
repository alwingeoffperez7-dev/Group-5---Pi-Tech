// Run: npm test
// API tests for sales, notifications and the bottled-water rule. They build a separate
// throwaway database "wasteless_test" from schema.sql + seed.sql (your real "wasteless"
// data is never touched) and drop it at the end. Skipped if MySQL isn't running.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const TEST_DB = 'wasteless_test';
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
const login = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };

// The SQL files use the database "wasteless"; point them at the test database instead
// (only in DROP/CREATE DATABASE and USE, so e.g. admin@wasteless.local stays as it is).
const sql = (file) => fs.readFileSync(path.join(__dirname, '..', 'database', file), 'utf8')
  .replace(/\b(DATABASE(?: IF EXISTS)?|USE)\s+wasteless\b/gi, `$1 ${TEST_DB}`);

let server, pool, root;

// Logs in and returns the session cookie.
async function signIn(email, password, role) {
  const fd = new FormData();
  fd.append('email', email); fd.append('password', password); fd.append('role', role);
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', body: fd });
  assert.strictEqual(res.status, 200, `login ${email}`);
  return res.headers.get('set-cookie').split(';')[0];
}

async function call(cookie, method, url, body) {
  const opts = { method, headers: { Cookie: cookie } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(BASE + url, opts);
  return { status: res.status, body: await res.json() };
}

test('API: sales, notifications, bottled water', async (t) => {
  try {
    root = await mysql.createConnection({ ...login, multipleStatements: true });
  } catch (e) {
    t.skip(`MySQL is not running (${e.code}), so the API tests were skipped`);
    return;
  }
  t.after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (pool) await pool.end();
    await root.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await root.end();
  });

  await root.query(sql('schema.sql'));
  await root.query(sql('seed.sql'));
  process.env.DB_NAME = TEST_DB;
  process.env.PORT = String(PORT);
  pool = require('./db');
  server = require('./server');
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));

  const vendor = await signIn('juan@example.com', 'vendor123', 'vendor');
  const admin = await signIn('admin@wasteless.local', 'admin123', 'admin');

  // A product with 5 in stock
  const fd = new FormData();
  for (const [k, v] of Object.entries({ product_name: 'Test Turon', category: 'Desserts', packaging_id: '4', unit_price: '15', stock: '5' })) fd.append(k, v);
  const added = await call(vendor, 'POST', '/api/products', fd);
  assert.strictEqual(added.status, 201);
  const id = added.body.product_id;
  assert.strictEqual(added.body.sold, 0);

  await t.test('a sale takes it out of stock and counts as sold', async () => {
    const r = await call(vendor, 'POST', `/api/products/${id}/sales`, { quantity: 2 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.stock, 3);
    assert.strictEqual(r.body.sold, 2);
    const stall = await call(vendor, 'GET', '/api/stall');
    assert.strictEqual(stall.body.summary.plastic_items_sold_this_week, 2);
  });

  await t.test('cannot sell more than is in stock, or a bad quantity', async () => {
    assert.strictEqual((await call(vendor, 'POST', `/api/products/${id}/sales`, { quantity: 4 })).status, 400);
    assert.strictEqual((await call(vendor, 'POST', `/api/products/${id}/sales`, { quantity: 0 })).status, 400);
    assert.strictEqual((await call(vendor, 'POST', '/api/products/99999/sales', {})).status, 404);
  });

  await t.test('undo puts the last sale back, then refuses when there is none', async () => {
    const r = await call(vendor, 'DELETE', `/api/products/${id}/sales/last`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.stock, 5);
    assert.strictEqual(r.body.sold, 0);
    assert.strictEqual((await call(vendor, 'DELETE', `/api/products/${id}/sales/last`)).status, 400);
  });

  await t.test('one cell can be saved on its own (inline editing)', async () => {
    const one = new FormData();
    one.append('stock', '9');
    const r = await call(vendor, 'PUT', `/api/products/${id}`, one);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.stock, 9);
    assert.strictEqual(r.body.product_name, 'Test Turon');
  });

  await t.test('bottled water is refused for vendors and admins', async () => {
    const rename = new FormData();
    rename.append('product_name', 'Mineral Water 500ml');
    assert.strictEqual((await call(vendor, 'PUT', `/api/products/${id}`, rename)).status, 400);
    const r = await call(admin, 'POST', '/api/admin/products', { product_name: 'Bottled Water', packaging_id: 3, category_id: 3, stall_id: 1 });
    assert.strictEqual(r.status, 400);
  });

  await t.test('admin notifies, vendor sees it and marks it read', async () => {
    assert.strictEqual((await call(admin, 'POST', '/api/admin/notifications', { product_id: id, comments: '  ' })).status, 400);
    assert.strictEqual((await call(vendor, 'POST', '/api/admin/notifications', { product_id: id, comments: 'x' })).status, 403);
    const sent = await call(admin, 'POST', '/api/admin/notifications', { product_id: id, comments: 'Please check the price.' });
    assert.strictEqual(sent.status, 201);

    const inbox = await call(vendor, 'GET', '/api/notifications');
    assert.strictEqual(inbox.body.unread, 1);
    assert.strictEqual(inbox.body.notifications[0].product_name, 'Test Turon');

    const nid = sent.body.notification_id;
    assert.strictEqual((await call(vendor, 'POST', `/api/notifications/${nid}/read`)).status, 200);
    assert.strictEqual((await call(vendor, 'GET', '/api/notifications')).body.unread, 0);
    const list = await call(admin, 'GET', '/api/admin/notifications');
    assert.strictEqual(list.body[0].is_read, true);
  });
});
