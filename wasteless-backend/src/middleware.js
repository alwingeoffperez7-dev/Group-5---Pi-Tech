const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('./db');

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
const sessions = new Map(); // token -> { staffId, canteenId, role, expires }
const SESSION_HOURS = 8; // log in again after 8 hours

// Cookie policy: the only cookie is "sid" (login session). Not readable by page
// scripts (httpOnly), never sent from other sites (sameSite strict), expires with
// the session, and HTTPS-only when COOKIE_SECURE=true in .env (turn on when deployed).
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/'
};

function readToken(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

function getSession(req) {
  const token = readToken(req);
  const s = token && sessions.get(token);
  if (!s) return undefined;
  if (s.expires < Date.now()) { sessions.delete(token); return undefined; }
  return s;
}

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_HOURS * 60 * 60 * 1000;
  sessions.set(token, { ...user, expires: Date.now() + maxAge });
  res.cookie('sid', token, { ...COOKIE_OPTIONS, maxAge });
}

function endSession(req, res) {
  const token = readToken(req);
  if (token) sessions.delete(token);
  res.clearCookie('sid', COOKIE_OPTIONS);
}

// Only let in a logged-in 'vendor' or 'admin'. Sets req.staffId / req.canteenId.
// Vendors are re-checked every request, so a stall the admin declines or removes
// is locked out right away (not only at the next login).
function requireRole(role) {
  return async (req, res, next) => {
    try {
      const s = getSession(req);
      if (!s) throw new HttpError(401, 'Please log in first');
      if (s.role !== role) throw new HttpError(403, `Only ${role} accounts can do this`);
      if (role === 'vendor') {
        const [[stall]] = await pool.query('SELECT status FROM canteen WHERE canteen_id = ?', [s.canteenId]);
        if (!stall || stall.status !== 'Approved') {
          endSession(req, res);
          throw new HttpError(401, 'Your stall account is no longer active. Please contact the admin.');
        }
      }
      req.staffId = s.staffId;
      req.canteenId = s.canteenId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------
// File uploads (product image, feedback screenshot) → /uploads
// ---------------------------------------------------------------------
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// The saved file's extension comes from this list, never from the uploaded name,
// so a file can only ever be served back as an image (not e.g. .html / .svg).
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_EXT[file.mimetype]}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ok = Boolean(IMAGE_EXT[file.mimetype]);
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
