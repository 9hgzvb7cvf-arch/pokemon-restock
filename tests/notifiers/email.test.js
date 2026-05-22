const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildHtml } = require('../../notifiers/email');

const makeProduct = (overrides = {}) => ({
  id:           'target-111',
  retailer:     'target',
  name:         'Pokemon TCG Elite Trainer Box',
  price:        '$49.99',
  priceNumeric: 49.99,
  url:          'https://www.target.com/p/-/A-111',
  inStock:      true,
  stockStatus:  'in_stock',
  changeType:   'new',
  msrp:         null,
  releaseDate:  null,
  ...overrides,
});

describe('Email notifier — buildHtml', () => {
  it('includes product name in output', () => {
    const html = buildHtml([makeProduct()], []);
    assert.ok(html.includes('Pokemon TCG Elite Trainer Box'));
  });

  it('includes NEW section header when new products present', () => {
    const html = buildHtml([makeProduct()], []);
    assert.ok(html.toLowerCase().includes('new products') || html.includes('🆕'));
  });

  it('includes RESTOCK section header when restocked products present', () => {
    const html = buildHtml([], [makeProduct({ changeType: 'restock' })]);
    assert.ok(html.toLowerCase().includes('restock') || html.includes('🔄'));
  });

  it('shows both sections when both types present', () => {
    const html = buildHtml([makeProduct()], [makeProduct({ changeType: 'restock', id: 'target-222' })]);
    assert.ok(html.includes('🆕') || html.toLowerCase().includes('new'));
    assert.ok(html.includes('🔄') || html.toLowerCase().includes('restock'));
  });

  it('includes Shop Now link with product URL', () => {
    const html = buildHtml([makeProduct()], []);
    assert.ok(html.includes('https://www.target.com/p/-/A-111'));
  });

  it('includes product price', () => {
    const html = buildHtml([makeProduct()], []);
    assert.ok(html.includes('$49.99'));
  });

  it('escapes HTML special characters in product name', () => {
    const html = buildHtml([makeProduct({ name: 'Pokemon <Test> & "Quotes"' })], []);
    assert.ok(!html.includes('<Test>'));   // angle brackets should be escaped
    assert.ok(html.includes('&lt;Test&gt;'));
  });

  it('shows MSRP when present', () => {
    const product = makeProduct({ msrp: { msrp: 49.99, msrpFormatted: '$49.99' } });
    const html = buildHtml([product], []);
    assert.ok(html.includes('MSRP'));
    assert.ok(html.includes('$49.99'));
  });

  it('shows release date when present', () => {
    const product = makeProduct({ releaseDate: '2026-06-01' });
    const html = buildHtml([product], []);
    assert.ok(html.includes('2026-06-01'));
  });

  it('includes footer text', () => {
    const html = buildHtml([makeProduct()], []);
    assert.ok(html.toLowerCase().includes('pokemon tcg'));
  });
});
