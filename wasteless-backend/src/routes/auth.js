// Log-in / Register pages. Replies use { success, message } because that's
// what system.js/login.js and register.js read.
const express = require('express');
const pool = require('../db');
const { upload, wrap, hashPassword, checkPassword, startSession, endSession } = require('../middleware');

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// POST /api/auth/register   FormData: business_name, email, user_pass, contact_number
// Creates the stall + its vendor login as "Pending" until an admin approves it.
router.post('/register', upload.none(), wrap(async (req, res) => {
  const name = String(req.body.business_name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.user_pass ?? req.body.password ?? '');
  const contact = String(req.body.contact_number ?? '').trim();

  if (!name || !email || !password || !contact) return fail(res, 400, 'Please fill in every field.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Please enter a valid email address.');
  if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');

  const [taken] = await pool.query('SELECT 1 FROM staff WHERE email = ?', [email]);
  if (taken.length) return fail(res, 400, 'That email is already registered.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [stall] = await conn.query(
      `INSERT INTO canteen (business_name, business_email, contact_number, status) VALUES (?, ?, ?, 'Pending')`,
      [name, email, contact]
    );
    await conn.query(
      `INSERT INTO staff (canteen_id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'vendor')`,
      [stall.insertId, name, email, hashPassword(password)]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.status(201).json({ success: true, message: 'Registered. An admin must approve your account before you can log in.' });
}));

// POST /api/auth/login   FormData: email, password, role ('vendor' | 'admin')
router.post('/login', upload.none(), wrap(async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const role = req.body.role;

  const [rows] = await pool.query(
    `SELECT s.staff_id, s.canteen_id, s.password_hash, s.role, c.status
     FROM staff s LEFT JOIN canteen c ON c.canteen_id = s.canteen_id
     WHERE s.email = ?`,
    [email]
  );
  const user = rows[0];
  if (!user || !checkPassword(password, user.password_hash)) return fail(res, 401, 'Invalid email or password.');
  if (role && role !== user.role) return fail(res, 403, `This is ${user.role === 'admin' ? 'an admin' : 'a vendor'} account. Use "Log In as ${user.role === 'admin' ? 'Admin' : 'Vendor'}".`);
  if (user.role === 'vendor' && user.status !== 'Approved') {
    const why = { Pending: 'is still waiting for admin approval', Declined: 'was declined by the admin', Removed: 'was removed by the admin' };
    return fail(res, 403, `Your stall account ${why[user.status] || 'is not active'}.`);
  }

  startSession(res, { staffId: user.staff_id, canteenId: user.canteen_id, role: user.role });
  res.json({ success: true, role: user.role });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ success: true });
});

module.exports = router;
