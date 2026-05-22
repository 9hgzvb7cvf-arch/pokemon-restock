const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const msrpChecker = require('../msrpChecker');
const config      = require('../config');
const { compareAndUpdate, initializeBaseline, loadState, saveState, summarizeState } = require('../stateManager');

const makeProduct = (overrides = {}) => ({
  id:           'target-111',
  retailer:     'target',
  name:         'Pokemon TCG Elite Trainer Box',
  price:        '$49.99',
  priceNumeric: 49.99,
  url:          'https://www.target.com/p/-/A-111',
  inStock:      true,
  stockStatus:  'in_stock',
  ...overrides,
});

let origFindMsrp;
let origFilterKeywords;

beforeEach(() => {
  origFindMsrp       = msrpChecker.findMsrp;
  origFilterKeywords = config.filterKeywords;
  // Default stubs: no MSRP gate, no keyword filter
  msrpChecker.findMsrp   = () => null;
  config.filterKeywords  = [];
});

afterEach(() => {
  msrpChecker.findMsrp  = origFindMsrp;
  config.filterKeywords = origFilterKeywords;
});

describe('compareAndUpdate — new products', () => {
  it('flags an in-stock product never seen before as new', () => {
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts, restockedProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(newProducts.length, 1);
    assert.equal(restockedProducts.length, 0);
    assert.equal(newProducts[0].changeType, 'new');
    assert.equal(newProducts[0].id, 'target-111');
  });

  it('does not flag an OOS new product as new', () => {
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct({ inStock: false, stockStatus: 'out_of_stock' })], state);
    assert.equal(newProducts.length, 0);
  });

  it('does not flag an already-seen in-stock product as new', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct(), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'in_stock' } },
    };
    const { newProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(newProducts.length, 0);
  });

  it('attaches msrp field from evaluateForNotification', () => {
    msrpChecker.findMsrp = () => ({ msrp: 49.99, msrpFormatted: '$49.99', similarity: 1.0, exact: true });
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.ok(newProducts[0].msrp !== null);
    assert.equal(newProducts[0].msrp.msrp, 49.99);
  });
});

describe('compareAndUpdate — restocks', () => {
  it('flags out_of_stock → in_stock as a restock', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct({ inStock: false, stockStatus: 'out_of_stock' }), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'out_of_stock' } },
    };
    const { newProducts, restockedProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(newProducts.length, 0);
    assert.equal(restockedProducts.length, 1);
    assert.equal(restockedProducts[0].changeType, 'restock');
    assert.equal(restockedProducts[0].previousStockStatus, 'out_of_stock');
  });

  it('flags pre_order → in_stock as a restock', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct({ inStock: false, stockStatus: 'pre_order' }), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'pre_order' } },
    };
    const { restockedProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(restockedProducts.length, 1);
    assert.equal(restockedProducts[0].previousStockStatus, 'pre_order');
  });

  it('does NOT flag in_stock → in_stock as a restock', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct(), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'in_stock' } },
    };
    const { restockedProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(restockedProducts.length, 0);
  });

  it('does NOT flag out_of_stock → out_of_stock as anything', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct({ inStock: false, stockStatus: 'out_of_stock' }), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'out_of_stock' } },
    };
    const { newProducts, restockedProducts } = compareAndUpdate('target', [makeProduct({ inStock: false, stockStatus: 'out_of_stock' })], state);
    assert.equal(newProducts.length, 0);
    assert.equal(restockedProducts.length, 0);
  });
});

describe('compareAndUpdate — MSRP price gate', () => {
  it('blocks new products priced above 120% of MSRP', () => {
    // MSRP $49.99, product priced at $65.00 = ~130% → should be blocked
    msrpChecker.findMsrp = () => ({ msrp: 49.99, msrpFormatted: '$49.99', similarity: 0.9, exact: false });
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const expensive = makeProduct({ price: '$65.00', priceNumeric: 65.00 });
    const { newProducts } = compareAndUpdate('target', [expensive], state);
    assert.equal(newProducts.length, 0);
  });

  it('allows new products at exactly 120% of MSRP', () => {
    // MSRP $49.99, product at $59.99 = 120.0% → should pass
    msrpChecker.findMsrp = () => ({ msrp: 49.99, msrpFormatted: '$49.99', similarity: 0.9, exact: false });
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const atCeiling = makeProduct({ price: '$59.99', priceNumeric: 59.988 }); // 49.99 * 1.2 = 59.988
    const { newProducts } = compareAndUpdate('target', [atCeiling], state);
    assert.equal(newProducts.length, 1);
  });

  it('passes when no MSRP match is found', () => {
    msrpChecker.findMsrp = () => null;
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct({ price: '$999.00', priceNumeric: 999 })], state);
    assert.equal(newProducts.length, 1);
  });

  it('passes when product has no numeric price', () => {
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct({ price: 'N/A', priceNumeric: null })], state);
    assert.equal(newProducts.length, 1);
  });
});

describe('compareAndUpdate — keyword filter', () => {
  it('blocks products whose name does not match any filterKeyword', () => {
    config.filterKeywords = ['booster', 'etb', 'tin'];
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    // Name is "Pokemon Plush Toy" — not matching any of the above
    const mismatch = makeProduct({ name: 'Pokemon Plush Toy' });
    const { newProducts } = compareAndUpdate('target', [mismatch], state);
    assert.equal(newProducts.length, 0);
  });

  it('allows products whose name matches a filterKeyword', () => {
    config.filterKeywords = ['elite trainer', 'etb'];
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct()], state);
    assert.equal(newProducts.length, 1);
  });

  it('allows all products when filterKeywords is empty', () => {
    config.filterKeywords = [];
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    const { newProducts } = compareAndUpdate('target', [makeProduct({ name: 'Pokemon Plush' })], state);
    assert.equal(newProducts.length, 1);
  });
});

describe('compareAndUpdate — state mutation', () => {
  it('adds new product to state', () => {
    const state = { version: 2, lastSaved: '2026-01-01T00:00:00.000Z' };
    compareAndUpdate('target', [makeProduct()], state);
    assert.ok(state.target?.['target-111']);
    assert.ok(state.target['target-111'].firstSeen);
    assert.equal(state.target['target-111'].lastStockStatus, 'in_stock');
  });

  it('updates lastStockStatus on known product', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: { 'target-111': { ...makeProduct({ inStock: false, stockStatus: 'out_of_stock' }), firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastStockStatus: 'out_of_stock' } },
    };
    compareAndUpdate('target', [makeProduct()], state);
    assert.equal(state.target['target-111'].lastStockStatus, 'in_stock');
  });
});

describe('summarizeState', () => {
  it('returns per-retailer totals', () => {
    const state = {
      version: 2, lastSaved: '2026-01-01T00:00:00.000Z',
      target: {
        'target-111': { ...makeProduct(), firstSeen: 'x', lastSeen: 'x', lastStockStatus: 'in_stock' },
        'target-222': { ...makeProduct({ id: 'target-222', inStock: false, stockStatus: 'out_of_stock' }), firstSeen: 'x', lastSeen: 'x', lastStockStatus: 'out_of_stock' },
      },
    };
    const rows = summarizeState(state);
    const targetRow = rows.find(r => r.retailer === 'target');
    assert.ok(targetRow);
    assert.equal(targetRow.total, 2);
    assert.equal(targetRow.inStock, 1);
    assert.equal(targetRow.outOfStock, 1);
  });
});
