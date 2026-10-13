const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ---------------------------------------------------------------------
// Which stall is making the request?
// TEMPORARY: there is no login yet, so we use DEFAULT_CANTEEN_ID from
// .env (or an X-Canteen-Id header for testing other stalls).
// When login is built, set req.canteenId from the logged-in staff instead.
// ---------------------------------------------------------------------
function currentStall(req, res, next) {
  const fromHeader = Number(req.get('X-Canteen-Id'));
  req.canteenId = fromHeader || Number(process.env.DEFAULT_CANTEEN_ID || 1);
  req.staffId = Number(process.env.DEFAULT_STAFF_ID || 0) || null;
  next();
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
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

// Delete an uploaded file if the request fails validation.
function discardUpload(req) {
  if (req.file) fs.unlink(req.file.path, () => {});
}

module.exports = { currentStall, upload, HttpError, wrap, errorHandler, discardUpload };
