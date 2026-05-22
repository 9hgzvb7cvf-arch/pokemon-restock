const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProduct, isSoldByTarget, isPreOrder } = require('../../scrapers/target');

// Mock raw Redsky API item shape
const makeRaw = (overrides = {}) => ({
  tcin: '12345678',
  item: {
    product_description: { title: 'Pokemon TCG: Scarlet & Violet Elite Trainer Box' },
    primary_brand: { name: 'The Pokemon Company' },
    enrichment: { buy_url: 'https://www.target.com/p/pokemon-tcg/-/A-12345678' },
    fulfillment: { is_marketplace: false },
    relationship_type: '',
  },
  price: {
    current_retail: 49.99,
    reg_retail: 49.99,
    formatted_current_price_type: '',
  },
  ...overrides,
});

describe('Target scraper — normalizeProduct', () => {
  it('produces correct shape for in-stock item', () => {
    const p = normalizeProduct(makeRaw(), 'in_stock');
    assert.equal(p.id, 'target-12345678');
    assert.equal(p.retailer, 'target');
    assert.equal(p.name, 'Pokemon TCG: Scarlet & Violet Elite Trainer Box');
    assert.equal(p.price, '$49.99');
    assert.equal(p.priceNumeric, 49.99);
    assert.equal(p.regularPrice, null);   // same as current price
    assert.equal(p.inStock, true);
    assert.equal(p.stockStatus, 'in_stock');
    assert.ok(p.url.includes('target.com'));
  });

  it('sets inStock=false for out_of_stock', () => {
    const p = normalizeProduct(makeRaw(), 'out_of_stock');
    assert.equal(p.inStock, false);
    assert.equal(p.stockStatus, 'out_of_stock');
  });

  it('sets inStock=false for pre_order', () => {
    const p = normalizeProduct(makeRaw(), 'pre_order');
    assert.equal(p.inStock, false);
    assert.equal(p.stockStatus, 'pre_order');
  });

  it('shows regularPrice when it differs from current price', () => {
    const raw = makeRaw();
    raw.price.reg_retail = 59.99;
    const p = normalizeProduct(raw, 'in_stock');
    assert.equal(p.regularPrice, '$59.99');
  });

  it('decodes HTML numeric entities in title', () => {
    const raw = makeRaw();
    raw.item.product_description.title = 'Pokemon&#174; TCG';
    const p = normalizeProduct(raw, 'in_stock');
    assert.ok(!p.name.includes('&#'));
  });

  it('falls back to tcin-based URL when buy_url is absent', () => {
    const raw = makeRaw();
    raw.item.enrichment.buy_url = '';
    const p = normalizeProduct(raw, 'in_stock');
    assert.ok(p.url.includes('12345678'));
  });

  it('formats N/A price when current_retail is null', () => {
    const raw = makeRaw();
    raw.price.current_retail = null;
    const p = normalizeProduct(raw, 'in_stock');
    assert.equal(p.price, 'N/A');
    assert.equal(p.priceNumeric, null);
  });
});

describe('Target scraper — isSoldByTarget', () => {
  it('returns true for first-party item', () => {
    assert.equal(isSoldByTarget(makeRaw()), true);
  });

  it('returns false when is_marketplace is true', () => {
    const raw = makeRaw();
    raw.item.fulfillment.is_marketplace = true;
    assert.equal(isSoldByTarget(raw), false);
  });

  it('returns false for TargetPlus relationship type', () => {
    const raw = makeRaw();
    raw.item.relationship_type = 'TargetPlus';
    assert.equal(isSoldByTarget(raw), false);
  });
});

describe('Target scraper — isPreOrder', () => {
  it('returns false for normal in-stock items', () => {
    assert.equal(isPreOrder(makeRaw()), false);
  });

  it('returns true when formatted_current_price_type is pre_order', () => {
    const raw = makeRaw();
    raw.price.formatted_current_price_type = 'pre_order';
    assert.equal(isPreOrder(raw), true);
  });

  it('returns true when formatted_current_price_type is preorder', () => {
    const raw = makeRaw();
    raw.price.formatted_current_price_type = 'preorder';
    assert.equal(isPreOrder(raw), true);
  });
});
