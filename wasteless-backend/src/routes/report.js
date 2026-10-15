// Vendor "Download Report" (Product Listing): a PDF of the stall's last 7 days.
// Each stall can download one report every 7 days; downloads are logged in report_download.
const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { HttpError, wrap } = require('../middleware');

const router = express.Router();
const WAIT_DAYS = 7;

// When can this stall download again? null = now.
async function nextAvailable(canteenId) {
  const [[last]] = await pool.query(
    'SELECT MAX(downloaded_at) AS at FROM report_download WHERE canteen_id = ?', [canteenId]
  );
  if (!last.at) return { last: null, next: null };
  const next = new Date(last.at.getTime() + WAIT_DAYS * 24 * 60 * 60 * 1000);
  return { last: last.at, next: next > new Date() ? next : null };
}

// GET /api/stall/report/status   -> { available, last_downloaded_at, next_available_at }
router.get('/status', wrap(async (req, res) => {
  const { last, next } = await nextAvailable(req.canteenId);
  res.json({ available: !next, last_downloaded_at: last, next_available_at: next });
}));

// GET /api/stall/report   -> the PDF (or 429 if downloaded in the last 7 days)
router.get('/', wrap(async (req, res) => {
  const { next } = await nextAvailable(req.canteenId);
  if (next) {
    throw new HttpError(429, `You can download your next report on ${formatDateTime(next)}.`, { next_available_at: next });
  }

  const data = await loadReportData(req.canteenId);
  const pdf = await buildPdf(data); // build first: a failed report doesn't use up the week

  await pool.query('INSERT INTO report_download (canteen_id, staff_id) VALUES (?, ?)', [req.canteenId, req.staffId]);

  const fileName = `WasteLess-Report-${data.stall.stall_id}-${isoDate(new Date())}.pdf`;
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` });
  res.send(pdf);
}));

// ---------- Data ----------
async function loadReportData(canteenId) {
  const [[stall]] = await pool.query(
    `SELECT canteen_id AS stall_id, business_name, contact_person, contact_number, business_email, location
     FROM canteen WHERE canteen_id = ?`, [canteenId]
  );
  // Products + what each sold in the last 7 days
  const [products] = await pool.query(
    `SELECT p.product_name, cat.category_name, pk.packaging_name, p.unit_price, p.stock,
            COALESCE(SUM(s.quantity_sold), 0) AS sold,
            COALESCE(SUM(s.quantity_sold * s.unit_price), 0) AS revenue
     FROM product p
     JOIN category cat ON cat.category_id = p.category_id
     JOIN packaging_category pk ON pk.packaging_id = p.packaging_id
     LEFT JOIN sales_record s ON s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
     WHERE p.canteen_id = ? AND p.is_active = 1
     GROUP BY p.product_id
     ORDER BY sold DESC, p.product_name`, [canteenId]
  );
  // Items sold per plastic packaging category (every category listed, even at 0)
  const [packaging] = await pool.query(
    `SELECT pk.packaging_name,
            COUNT(DISTINCT CASE WHEN p.is_active = 1 THEN p.product_id END) AS products,
            COALESCE(SUM(s.quantity_sold), 0) AS sold
     FROM packaging_category pk
     LEFT JOIN product p ON p.packaging_id = pk.packaging_id AND p.canteen_id = ?
     LEFT JOIN sales_record s ON s.product_id = p.product_id AND s.sold_at >= CURDATE() - INTERVAL 6 DAY
     GROUP BY pk.packaging_id
     ORDER BY pk.packaging_id`, [canteenId]
  );
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    stall,
    products,
    packaging,
    period: { from, to: new Date() },
    totals: {
      revenue: products.reduce((sum, p) => sum + Number(p.revenue), 0),
      sold: products.reduce((sum, p) => sum + Number(p.sold), 0)
    }
  };
}

// ---------- PDF ----------
// Built-in PDF fonts have no peso sign, so amounts are written as "PHP 12.00".
const money = (n) => `PHP ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const formatDateTime = (d) => d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function buildPdf({ stall, products, packaging, period, totals }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('WasteLess Weekly Stall Report');
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text('Canteen Inventory and Plastic Waste Monitoring System, QCU Cooperative');
    doc.moveDown();
    doc.fillColor('#000000').fontSize(11);
    line(doc, 'Stall', `#${stall.stall_id}  ${stall.business_name}`);
    if (stall.contact_person) line(doc, 'Contact', [stall.contact_person, stall.contact_number].filter(Boolean).join(', '));
    if (stall.location) line(doc, 'Location', stall.location);
    line(doc, 'Period', `${formatDate(period.from)} to ${formatDate(period.to)} (last 7 days)`);
    line(doc, 'Generated', formatDateTime(new Date()));

    // Summary
    heading(doc, 'Summary');
    line(doc, 'Sales & Revenue', money(totals.revenue));
    line(doc, 'Items sold', String(totals.sold));
    line(doc, 'Products listed', String(products.length));

    // Plastic packaging
    heading(doc, 'Plastic Packaging Used');
    doc.fontSize(9).fillColor('#555555').text('Every item sold leaves this packaging behind.').fillColor('#000000');
    doc.moveDown(0.5);
    table(doc,
      [{ label: 'Packaging Category', width: 250 }, { label: 'Products', width: 100, align: 'right' }, { label: 'Items sold', width: 145, align: 'right' }],
      packaging.map((p) => [p.packaging_name, String(p.products), String(p.sold)]));

    // Products
    heading(doc, 'Products');
    table(doc,
      [
        { label: 'Product', width: 125 }, { label: 'Category', width: 65 }, { label: 'Packaging', width: 95 },
        { label: 'Price', width: 65, align: 'right' }, { label: 'Stock', width: 40, align: 'right' },
        { label: 'Sold', width: 40, align: 'right' }, { label: 'Revenue', width: 65, align: 'right' }
      ],
      products.map((p) => [p.product_name, p.category_name, p.packaging_name, money(p.unit_price), String(p.stock), String(p.sold), money(p.revenue)]),
      'No products listed.');

    doc.end();
  });
}

function heading(doc, text) {
  doc.moveDown(1.2);
  doc.x = doc.page.margins.left;
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#166534').text(text).fillColor('#000000').font('Helvetica').fontSize(11);
  doc.moveDown(0.3);
}

function line(doc, label, value) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
}

// Simple table: header row, then rows; starts a new page (and repeats the header) when full.
function table(doc, columns, rows, emptyText) {
  const left = doc.page.margins.left;
  const rowHeight = 18;
  const drawRow = (cells, bold) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawRow(columns.map((c) => c.label), true);
    }
    const y = doc.y;
    let x = left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((cell, i) => {
      doc.text(cell, x + 3, y + 4, { width: columns[i].width - 6, align: columns[i].align || 'left', lineBreak: false, ellipsis: true });
      x += columns[i].width;
    });
    const width = columns.reduce((sum, c) => sum + c.width, 0);
    doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).strokeColor(bold ? '#333333' : '#dddddd').stroke();
    doc.x = left;
    doc.y = y + rowHeight;
  };
  drawRow(columns.map((c) => c.label), true);
  if (!rows.length) {
    doc.font('Helvetica').fontSize(9).text(emptyText || 'No data.', left + 3, doc.y + 4);
    return;
  }
  rows.forEach((r) => drawRow(r, false));
}

module.exports = router;
