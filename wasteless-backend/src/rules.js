// Business rules shared by the vendor and admin product routes.
const { HttpError } = require('./middleware');

// Team rule (2026-11): bottled water is not allowed, even though caps / lids are.
// ponytail: checks the product name only; a vendor could still list it under another name.
const BOTTLED_WATER = /\b(bottled|mineral|purified|distilled|spring)\s+water\b/i;

function isBottledWater(name) {
  return BOTTLED_WATER.test(String(name || ''));
}

// Throws a 400 the forms can show next to the Product Name field.
function rejectBottledWater(name) {
  if (isBottledWater(name)) {
    const message = 'Bottled water is not allowed in the canteen. Please list a different product.';
    throw new HttpError(400, message, { product_name: message });
  }
}

module.exports = { isBottledWater, rejectBottledWater };
