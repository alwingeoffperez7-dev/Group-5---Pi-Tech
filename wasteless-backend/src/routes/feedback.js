// Feedback / Report page: send a message to the admin, list my submissions.
const express = require('express');
const pool = require('../db');
const { upload, HttpError, wrap, discardUpload } = require('../middleware');

const router = express.Router();
const TYPES = ['Inquiry', 'Report a Problem', 'Suggestion', 'Stall Info Change'];

const toJson = (row) => ({
  ...row,
  attachment_url: row.attachment_path ? `/uploads/${row.attachment_path}` : null
});

// GET /api/feedback   ("My Submissions", newest first)
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT feedback_id, feedback_type, subject, status, created_at
     FROM feedback WHERE canteen_id = ? ORDER BY created_at DESC, feedback_id DESC`,
    [req.canteenId]
  );
  res.json({ count: rows.length, submissions: rows });
}));

// GET /api/feedback/:id   ("View" button)
router.get('/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM feedback WHERE feedback_id = ? AND canteen_id = ?',
    [req.params.id, req.canteenId]
  );
  if (!rows[0]) throw new HttpError(404, 'Submission not found');
  res.json(toJson(rows[0]));
}));

// POST /api/feedback   ("Send to Admin")
// FormData fields: feedback_type, subject, message, attachment (optional image)
router.post('/', upload.single('attachment'), wrap(async (req, res) => {
  const type = req.body.feedback_type ?? req.body.type;
  const subject = String(req.body.subject ?? '').trim();
  const message = String(req.body.message ?? '').trim();

  const errors = {};
  if (!TYPES.includes(type)) errors.feedback_type = `Type must be one of: ${TYPES.join(', ')}`;
  if (!subject) errors.subject = 'Subject is required';
  else if (subject.length > 150) errors.subject = 'Subject is too long (max 150)';
  if (!message) errors.message = 'Message is required';
  if (Object.keys(errors).length) {
    discardUpload(req);
    throw new HttpError(400, 'Please fix the highlighted fields', errors);
  }

  const [result] = await pool.query(
    `INSERT INTO feedback (canteen_id, staff_id, feedback_type, subject, message, attachment_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.canteenId, req.staffId, type, subject, message, req.file ? req.file.filename : null]
  );
  const [rows] = await pool.query('SELECT * FROM feedback WHERE feedback_id = ?', [result.insertId]);
  res.status(201).json(toJson(rows[0]));
}));

module.exports = router;
