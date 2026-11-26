// Admin page (system.html/admin-page.html). Field names match the render
// functions in system.js/admin-page.js.
// List routes take ?search=&filter=&sort= straight from getListOptions().
const express = require("express");
const pool = require("../db");
const { HttpError, wrap } = require("../middleware");
const { rejectBottledWater } = require("../rules");

const router = express.Router();

const like = (s) => `%${s}%`;
const pickSort = (sort, map, fallback) => map[sort] || map[fallback];
const NAME_SORT = (col, dateCol) => ({
  name_asc: `${col} ASC`,
  name_desc: `${col} DESC`,
  newest: `${dateCol} DESC`,
  oldest: `${dateCol} ASC`,
});

function required(body, fields) {
  const errors = {};
  fields.forEach((f) => {
    if (!String(body[f] ?? "").trim()) errors[f] = "This field is required";
  });
  if (Object.keys(errors).length)
    throw new HttpError(400, "Please fill in the required fields", errors);
}

// ---------- Dashboard ----------
router.get(
  "/stats",
  wrap(async (req, res) => {
    const [[stats]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM canteen WHERE status = 'Approved') AS total_stalls,
            (SELECT COUNT(*) FROM packaging_category) AS total_categories,
            (SELECT COUNT(*) FROM product WHERE is_active = 1) AS total_products,
            (SELECT COUNT(*) FROM canteen WHERE status = 'Pending') AS pending_accounts,
            (SELECT threshold FROM conditions WHERE condition_code = 'high_overall') AS weekly_limit`,
    );
    // "Plastic by stall": pieces sold in the last 7 days per approved stall, most first
    const [byStall] = await pool.query(
      `SELECT c.canteen_id AS stall_id, c.business_name, COALESCE(SUM(s.quantity_sold), 0) AS pieces
     FROM canteen c
     LEFT JOIN product p ON p.canteen_id = c.canteen_id
     LEFT JOIN sales_record s ON s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
     WHERE c.status = 'Approved'
     GROUP BY c.canteen_id, c.business_name
     ORDER BY pieces DESC, c.business_name`,
    );
    res.json({
      ...stats,
      plastic_by_stall: byStall.map((r) => ({ ...r, pieces: Number(r.pieces) })),
    });
  }),
);

// ?sort=newest|oldest&status=Pending|Replied|Resolved
router.get(
  "/feedback",
  wrap(async (req, res) => {
    const allowed = ["Pending", "Replied", "Resolved"];
    const status = allowed.includes(req.query.status) ? req.query.status : "";
    const [rows] = await pool.query(
      `SELECT f.feedback_id, f.subject, f.message, f.feedback_type, f.status, f.admin_reply,
            f.attachment_path, f.created_at, c.business_name
     FROM feedback f JOIN canteen c ON c.canteen_id = f.canteen_id
     ${status ? "WHERE f.status = ?" : ""}
     ORDER BY f.created_at ${req.query.sort === "oldest" ? "ASC" : "DESC"}, f.feedback_id`,
      status ? [status] : [],
    );
    res.json(
      rows.map((r) => ({
        ...r,
        attachment_url: r.attachment_path ? `/uploads/${r.attachment_path}` : null,
        tags: [r.feedback_type, r.status, r.business_name],
      })),
    );
  }),
);

router.put(
  "/feedback/:id",
  wrap(async (req, res) => {
    const reply = String(req.body.admin_reply ?? "").trim();
    const allowed = ["Pending", "Replied", "Resolved"];
    let status = req.body.status;
    if (!status) status = reply ? "Replied" : "Pending";
    if (!allowed.includes(status)) {
      throw new HttpError(400, "Invalid feedback status");
    }
    const [r] = await pool.query(
      "UPDATE feedback SET admin_reply = ?, status = ? WHERE feedback_id = ?",
      [reply || null, status, req.params.id],
    );
    if (!r.affectedRows) throw new HttpError(404, "Feedback not found");
    res.json({ feedback_id: Number(req.params.id), status, admin_reply: reply || null });
  }),
);

// ---------- Account Management (vendor sign-ups) ----------
// filter = Pending | Approved | Declined (empty = all)
router.get(
  "/accounts",
  wrap(async (req, res) => {
    const { search, filter, sort } = req.query;
    const where = [`c.status <> 'Removed'`];
    const params = [];
    if (filter) {
      where.push("c.status = ?");
      params.push(filter);
    }
    if (search) {
      where.push(
        "(c.business_name LIKE ? OR s.email LIKE ? OR c.contact_person LIKE ?)",
      );
      params.push(like(search), like(search), like(search));
    }
    const [rows] = await pool.query(
      `SELECT c.canteen_id AS account_id, c.business_name, s.email, c.contact_person,
            c.contact_number, c.status, c.joined_date
     FROM canteen c JOIN staff s ON s.canteen_id = c.canteen_id AND s.role = 'vendor'
     WHERE ${where.join(" AND ")}
     ORDER BY ${pickSort(sort, NAME_SORT("c.business_name", "c.canteen_id"), "newest")}`,
      params,
    );
    res.json(rows);
  }),
);

for (const [action, status] of [
  ["approve", "Approved"],
  ["decline", "Declined"],
]) {
  router.post(
    `/accounts/:id/${action}`,
    wrap(async (req, res) => {
      const [r] = await pool.query(
        `UPDATE canteen SET status = ? WHERE canteen_id = ? AND status <> 'Removed'`,
        [status, req.params.id],
      );
      if (!r.affectedRows) throw new HttpError(404, "Account not found");
      res.json({ account_id: Number(req.params.id), status });
    }),
  );
}

// ---------- Stall Management ----------
// filter = over | under (compared to the weekly plastic limit)
router.get(
  "/stalls",
  wrap(async (req, res) => {
    const { search, filter, sort } = req.query;
    const where = [`c.status = 'Approved'`];
    const params = [];
    if (search) {
      where.push(
        "(c.business_name LIKE ? OR c.contact_person LIKE ? OR c.business_email LIKE ?)",
      );
      params.push(like(search), like(search), like(search));
    }
    let having = "";
    if (filter === "over" || filter === "under") {
      const [[cond]] = await pool.query(
        "SELECT threshold FROM conditions WHERE condition_code = 'high_overall'",
      );
      const limit = Number(cond?.threshold ?? 90);
      having =
        filter === "over"
          ? "HAVING COALESCE(SUM(s.quantity_sold), 0) >= ?"
          : "HAVING COALESCE(SUM(s.quantity_sold), 0) < ?";
      params.push(limit);
    }
    const [rows] = await pool.query(
      `SELECT c.canteen_id AS stall_id, c.business_name, c.contact_person, c.contact_number,
            c.business_email AS email, c.location, c.joined_date
     FROM canteen c
     LEFT JOIN product p ON p.canteen_id = c.canteen_id
     LEFT JOIN sales_record s ON s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
     WHERE ${where.join(" AND ")}
     GROUP BY c.canteen_id, c.business_name, c.contact_person, c.contact_number, c.business_email, c.location, c.joined_date
     ${having}
     ORDER BY ${pickSort(sort, NAME_SORT("c.business_name", "c.canteen_id"), "name_asc")}`,
      params,
    );
    res.json(rows);
  }),
);

const stallValues = (b) => [
  String(b.business_name).trim(),
  String(b.contact_person ?? "").trim() || null,
  String(b.contact_number ?? "").trim() || null,
  String(b.email ?? "").trim() || null,
];

router.post(
  "/stalls",
  wrap(async (req, res) => {
    required(req.body, ["business_name"]);
    const [r] = await pool.query(
      `INSERT INTO canteen (business_name, contact_person, contact_number, business_email, status)
     VALUES (?, ?, ?, ?, 'Approved')`,
      stallValues(req.body),
    );
    res.status(201).json({ stall_id: r.insertId });
  }),
);

router.put(
  "/stalls/:id",
  wrap(async (req, res) => {
    required(req.body, ["business_name"]);
    const [r] = await pool.query(
      `UPDATE canteen SET business_name = ?, contact_person = ?, contact_number = ?, business_email = ?
     WHERE canteen_id = ? AND status <> 'Removed'`,
      [...stallValues(req.body), req.params.id],
    );
    if (!r.affectedRows) throw new HttpError(404, "Stall not found");
    res.json({ stall_id: Number(req.params.id) });
  }),
);

// Soft delete: the stall's sales/feedback history stays; its login stops working.
router.delete(
  "/stalls/:id",
  wrap(async (req, res) => {
    const [r] = await pool.query(
      `UPDATE canteen SET status = 'Removed' WHERE canteen_id = ? AND status <> 'Removed'`,
      [req.params.id],
    );
    if (!r.affectedRows) throw new HttpError(404, "Stall not found");
    await pool.query("UPDATE product SET is_active = 0 WHERE canteen_id = ?", [
      req.params.id,
    ]);
    res.json({ deleted: true });
  }),
);

// ---------- Product Management (all stalls) ----------
// filter = packaging_id
router.get(
  "/products",
  wrap(async (req, res) => {
    const { search, filter, sort } = req.query;
    const where = ["p.is_active = 1"];
    const params = [];
    if (filter) {
      where.push("p.packaging_id = ?");
      params.push(filter);
    }
    if (search) {
      where.push("p.product_name LIKE ?");
      params.push(like(search));
    }
    const [rows] = await pool.query(
      `SELECT p.product_id, p.product_name, p.packaging_id, pk.packaging_name,
            p.category_id, cat.category_name,
            p.canteen_id AS stall_id, c.business_name AS stall_name, p.unit_price, p.stock
     FROM product p
     JOIN canteen c ON c.canteen_id = p.canteen_id
     JOIN category cat ON cat.category_id = p.category_id
     JOIN packaging_category pk ON pk.packaging_id = p.packaging_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${pickSort(sort, NAME_SORT("p.product_name", "p.created_at"), "name_asc")}`,
      params,
    );
    res.json(rows);
  }),
);

async function checkProductRefs(body) {
  const checks = [
    [
      "packaging_id",
      "SELECT 1 FROM packaging_category WHERE packaging_id = ?",
      "Pick a valid packaging category",
    ],
    [
      "category_id",
      "SELECT 1 FROM category WHERE category_id = ?",
      "Pick a valid category",
    ],
    [
      "stall_id",
      `SELECT 1 FROM canteen WHERE canteen_id = ? AND status = 'Approved'`,
      "Pick a valid stall",
    ],
  ];
  for (const [field, sql, message] of checks) {
    if (body[field] === undefined || body[field] === "") continue;
    const [r] = await pool.query(sql, [body[field]]);
    if (!r.length) throw new HttpError(400, message, { [field]: message });
  }
}

// Price/stock start at 0; the vendor fills them in from their own page.
router.post(
  "/products",
  wrap(async (req, res) => {
    required(req.body, [
      "product_name",
      "packaging_id",
      "category_id",
      "stall_id",
    ]);
    await checkProductRefs(req.body);
    if (req.body.product_name !== undefined) rejectBottledWater(req.body.product_name);
    const [r] = await pool.query(
      `INSERT INTO product (canteen_id, category_id, packaging_id, product_name, unit_price) VALUES (?, ?, ?, ?, 0)`,
      [
        req.body.stall_id,
        req.body.category_id,
        req.body.packaging_id,
        String(req.body.product_name).trim(),
      ],
    );
    res.status(201).json({ product_id: r.insertId });
  }),
);

// Only the fields sent are changed (the row's packaging dropdown sends just packaging_id).
router.put(
  "/products/:id",
  wrap(async (req, res) => {
    const cols = {
      product_name: "product_name",
      packaging_id: "packaging_id",
      category_id: "category_id",
      stall_id: "canteen_id",
    };
    const sent = Object.keys(cols).filter(
      (k) => req.body[k] !== undefined && req.body[k] !== "",
    );
    if (!sent.length) throw new HttpError(400, "Nothing to update");
    await checkProductRefs(req.body);
    if (req.body.product_name !== undefined) rejectBottledWater(req.body.product_name);
    const [r] = await pool.query(
      `UPDATE product SET ${sent.map((k) => `${cols[k]} = ?`).join(", ")} WHERE product_id = ? AND is_active = 1`,
      [
        ...sent.map((k) =>
          k === "product_name" ? String(req.body[k]).trim() : req.body[k],
        ),
        req.params.id,
      ],
    );
    if (!r.affectedRows) throw new HttpError(404, "Product not found");
    res.json({ product_id: Number(req.params.id) });
  }),
);

router.delete(
  "/products/:id",
  wrap(async (req, res) => {
    const [r] = await pool.query(
      "UPDATE product SET is_active = 0 WHERE product_id = ? AND is_active = 1",
      [req.params.id],
    );
    if (!r.affectedRows) throw new HttpError(404, "Product not found");
    res.json({ deleted: true });
  }),
);

// ---------- Packaging Category Management (plastic packaging) ----------
// filter = used | unused
router.get(
  "/packaging",
  wrap(async (req, res) => {
    const { search, filter, sort } = req.query;
    const sorts = {
      name_asc: "pk.packaging_name ASC",
      name_desc: "pk.packaging_name DESC",
      items_desc: "item_count DESC",
      items_asc: "item_count ASC",
    };
    const having =
      filter === "used"
        ? "HAVING COUNT(p.product_id) > 0"
        : filter === "unused"
          ? "HAVING COUNT(p.product_id) = 0"
          : "";
    const [rows] = await pool.query(
      `SELECT pk.packaging_id, pk.packaging_name, pk.description, pk.example, COUNT(p.product_id) AS item_count
     FROM packaging_category pk
     LEFT JOIN product p ON p.packaging_id = pk.packaging_id AND p.is_active = 1
     ${search ? "WHERE pk.packaging_name LIKE ?" : ""}
     GROUP BY pk.packaging_id
     ${having}
     ORDER BY ${sorts[sort] || "pk.packaging_id ASC"}`,
      search ? [like(search)] : [],
    );
    res.json(rows);
  }),
);

const packagingValues = (b) => [
  String(b.packaging_name).trim(),
  String(b.description ?? "").trim() || null,
  String(b.example ?? "").trim() || null,
];

router.post(
  "/packaging",
  wrap(async (req, res) => {
    required(req.body, ["packaging_name"]);
    const [r] = await pool.query(
      "INSERT INTO packaging_category (packaging_name, description, example) VALUES (?, ?, ?)",
      packagingValues(req.body),
    );
    res.status(201).json({ packaging_id: r.insertId });
  }),
);

router.put(
  "/packaging/:id",
  wrap(async (req, res) => {
    required(req.body, ["packaging_name"]);
    const [r] = await pool.query(
      "UPDATE packaging_category SET packaging_name = ?, description = ?, example = ? WHERE packaging_id = ?",
      [...packagingValues(req.body), req.params.id],
    );
    if (!r.affectedRows)
      throw new HttpError(404, "Packaging category not found");
    res.json({ packaging_id: Number(req.params.id) });
  }),
);

router.delete(
  "/packaging/:id",
  wrap(async (req, res) => {
    const [[used]] = await pool.query(
      "SELECT COUNT(*) AS n FROM product WHERE packaging_id = ? AND is_active = 1",
      [req.params.id],
    );
    if (used.n)
      throw new HttpError(
        400,
        `${used.n} product(s) still use this packaging category. Move them first.`,
      );
    const [r] = await pool.query(
      "DELETE FROM packaging_category WHERE packaging_id = ?",
      [req.params.id],
    );
    if (!r.affectedRows)
      throw new HttpError(404, "Packaging category not found");
    res.json({ deleted: true });
  }),
);

const UNITS = {
  high_overall: "pieces / week",
  category_share: "% of the week",
};

router.get(
  "/eco/conditions",
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT * FROM conditions ORDER BY condition_id",
    );
    res.json(rows.map((r) => ({ ...r, unit: UNITS[r.condition_code] || "" })));
  }),
);

// good_week has no threshold of its own (it just means "under the weekly limit"),
// so for that row only the text is saved.
router.put(
  "/eco/conditions/:id",
  wrap(async (req, res) => {
    required(req.body, ["tip_text"]);
    const [[cond]] = await pool.query(
      "SELECT condition_code, threshold FROM conditions WHERE condition_id = ?",
      [req.params.id],
    );
    if (!cond) throw new HttpError(404, "Condition not found");
    let threshold = null;
    if (cond.threshold !== null) {
      threshold = Number(req.body.threshold);
      const max = cond.condition_code === "category_share" ? 100 : 100000; // a share can't be over 100%
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > max) {
        const message = `Threshold must be a whole number from 1 to ${max}`;
        throw new HttpError(400, message + ".", { threshold: message });
      }
    }
    await pool.query(
      "UPDATE conditions SET threshold = ?, tip_text = ? WHERE condition_id = ?",
      [threshold, String(req.body.tip_text).trim(), req.params.id],
    );
    res.json({ condition_id: Number(req.params.id) });
  }),
);

// One row per packaging category (tip fields empty if it has no tip yet)
router.get(
  "/eco/tips",
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT pk.packaging_id, pk.packaging_name, t.effects, t.tip_text
     FROM packaging_category pk LEFT JOIN eco_tip t ON t.packaging_id = pk.packaging_id
     ORDER BY pk.packaging_id`,
    );
    res.json(rows);
  }),
);

router.put(
  "/eco/tips/:packagingId",
  wrap(async (req, res) => {
    required(req.body, ["tip_text"]);
    const [[pk]] = await pool.query(
      "SELECT packaging_id FROM packaging_category WHERE packaging_id = ?",
      [req.params.packagingId],
    );
    if (!pk) throw new HttpError(404, "Packaging category not found");
    await pool.query(
      `INSERT INTO eco_tip (packaging_id, condition_id, effects, tip_text)
     VALUES (?, (SELECT condition_id FROM conditions WHERE condition_code = 'category_share'), ?, ?)
     ON DUPLICATE KEY UPDATE effects = VALUES(effects), tip_text = VALUES(tip_text)`,
      [
        pk.packaging_id,
        String(req.body.effects ?? "").trim() || null,
        String(req.body.tip_text).trim(),
      ],
    );
    res.json({ packaging_id: pk.packaging_id });
  }),
);

// ---------- Notify vendors (Product Management > Notify) ----------
// The admin writes a comment about one product; it goes to that product's stall
// and shows in the vendor's notification bell (GET /api/notifications).
router.get(
  "/notifications",
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT n.notification_id, n.canteen_id AS stall_id, c.business_name AS stall_name,
              n.product_id, p.product_name, n.message, n.is_read, n.created_at
       FROM notification n
       JOIN canteen c ON c.canteen_id = n.canteen_id
       LEFT JOIN product p ON p.product_id = n.product_id
       WHERE n.notif_type = 'admin'
       ORDER BY n.created_at DESC, n.notification_id DESC
       LIMIT 100`,
    );
    res.json(rows.map((r) => ({ ...r, is_read: Boolean(r.is_read) })));
  }),
);

// POST /api/admin/notifications   { product_id, comments }
router.post(
  "/notifications",
  wrap(async (req, res) => {
    const message = String(req.body.comments ?? req.body.message ?? "").trim();
    if (!message) {
      throw new HttpError(400, "Please write a comment for the vendor.", { comments: "Required" });
    }
    if (message.length > 500) {
      throw new HttpError(400, "The comment is too long (max 500 characters).", { comments: "Max 500" });
    }
    const [[p]] = await pool.query(
      "SELECT product_id, canteen_id FROM product WHERE product_id = ? AND is_active = 1",
      [req.body.product_id ?? null],
    );
    if (!p) throw new HttpError(404, "Product not found");
    const [r] = await pool.query(
      `INSERT INTO notification (canteen_id, product_id, notif_type, message)
       VALUES (?, ?, 'admin', ?)`,
      [p.canteen_id, p.product_id, message],
    );
    res.status(201).json({ notification_id: r.insertId });
  }),
);

module.exports = router;
