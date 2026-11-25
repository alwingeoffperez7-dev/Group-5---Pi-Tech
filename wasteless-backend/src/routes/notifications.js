// Vendor notification bell: messages the admin sent about this stall's products
// (admin page > Product Management > Notify). Uses the `notification` table.
const express = require('express');
const pool = require('../db');
const { HttpError, wrap } = require('../middleware');

const router = express.Router();

// GET /api/notifications  ->  { unread, notifications: [{ notification_id, product_name, message, is_read, created_at }] }
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT n.notification_id, n.product_id, p.product_name, n.message, n.is_read, n.created_at
     FROM notification n LEFT JOIN product p ON p.product_id = n.product_id
     WHERE n.canteen_id = ? AND n.notif_type = 'admin'
     ORDER BY n.created_at DESC, n.notification_id DESC
     LIMIT 100`,
    [req.canteenId]
  );
  const notifications = rows.map((r) => ({ ...r, is_read: Boolean(r.is_read) }));
  res.json({ unread: notifications.filter((n) => !n.is_read).length, notifications });
}));

// POST /api/notifications/:id/read   ("Read" button)
router.post('/:id/read', wrap(async (req, res) => {
  const [r] = await pool.query(
    'UPDATE notification SET is_read = 1 WHERE notification_id = ? AND canteen_id = ?',
    [req.params.id, req.canteenId]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Notification not found');
  res.json({ notification_id: Number(req.params.id), is_read: true });
}));

module.exports = router;
