const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

// ---------------------------------------------------------------------
// Passwords: scrypt with a random salt, stored as "salt:hash".
// ---------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const given = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------------
// Login sessions: a random token in an httpOnly "sid" cookie.
// ponytail: kept in memory, so everyone is logged out when the server
// restarts. Move to a session table if that becomes a problem.
// ---------------------------------------------------------------------
const sessions = new Map(); // token -> { staffId, canteenId, role }

function getSession(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  return m ? sessions.get(m[1]) : undefined;
}

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax' });
}

function endSession(req, res) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  if (m) sessions.delete(m[1]);
  res.clearCookie('sid');
}

// Only let in a logged-in 'vendor' or 'admin'. Sets req.staffId / req.canteenId.
function requireRole(role) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) throw new HttpError(401, 'Please log in first');
    if (s.role !== role) throw new HttpError(403, `Only ${role} accounts can do this`);
    req.staffId = s.staffId;
    req.canteenId = s.canteenId;
    next();
  };
}

// ---------------------------------------------------------------------
// File uploads (product image, feedback screenshot) → /uploads
// ---------------------------------------------------------------------
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'), ok);
  }
});

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wrap async route handlers so thrown errors reach errorHandler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 2 MB or smaller' : err.message });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That name or email is already used' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ error: 'It is still used by other records, so it cannot be deleted' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

// Delete an uploaded file if the request fails validation.
function discardUpload(req) {
  if (req.file) fs.unlink(req.file.path, () => {});
}

module.exports = {
  hashPassword, checkPassword, startSession, endSession, requireRole,
  upload, HttpError, wrap, errorHandler, discardUpload
};
