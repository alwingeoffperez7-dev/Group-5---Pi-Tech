// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { isBottledWater } = require('./rules');

test('bottled water names are refused', () => {
  for (const name of ['Bottled Water', 'Nature Spring 500ml Mineral Water', 'purified water 1L', 'Distilled  Water', 'Spring Water']) {
    assert.ok(isBottledWater(name), name);
  }
});

test('other products are fine, including caps and juice', () => {
  for (const name of ['Bottle Cap', 'Zest-O Juice', 'Watermelon Shake', 'Water Spinach (Kangkong)', 'Yakult', '']) {
    assert.ok(!isBottledWater(name), name);
  }
});
