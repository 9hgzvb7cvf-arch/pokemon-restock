const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { normalizeProductName, calculateSimilarity, findMsrp } = require('../msrpChecker');

const DB_FILE = path.resolve('./data/msrp-database.json');

describe('MSRP — normalizeProductName', () => {
  it('lowercases the name', () => {
    const n = normalizeProductName('Pokemon TCG Elite Trainer Box');
    assert.equal(n, n.toLowerCase());
  });

  it('removes common noise words', () => {
    const n = normalizeProductName('Pokemon TCG Booster Pack');
    // 'pokemon', 'tcg', 'trading card game', 'card' should be stripped
    assert.ok(!n.includes('pokemon'));
    assert.ok(!n.includes('tcg'));
  });

  it('handles empty string gracefully', () => {
    assert.equal(normalizeProductName(''), '');
  });

  it('collapses extra whitespace', () => {
    const n = normalizeProductName('Pokemon   TCG   ETB');
    assert.ok(!n.includes('  '));
  });
});

describe('MSRP — calculateSimilarity', () => {
  it('returns 1.0 for identical names', () => {
    const s = calculateSimilarity('Pokemon TCG Scarlet & Violet ETB', 'Pokemon TCG Scarlet & Violet ETB');
    assert.equal(s, 1.0);
  });

  it('returns a high score for names that differ only in noise words', () => {
    const s = calculateSimilarity(
      'Pokemon TCG: Scarlet & Violet Elite Trainer Box',
      'Scarlet & Violet Elite Trainer Box',
    );
    assert.ok(s > 0.6, `Expected > 0.6, got ${s}`);
  });

  it('returns a low score for completely different products', () => {
    const s = calculateSimilarity(
      'Pokemon Scarlet & Violet Elite Trainer Box',
      'Pokemon 151 Booster Pack',
    );
    assert.ok(s < 0.5, `Expected < 0.5, got ${s}`);
  });

  it('penalizes product-type mismatch (ETB vs Booster)', () => {
    const sameType = calculateSimilarity('Scarlet & Violet Elite Trainer Box', 'Scarlet & Violet Elite Trainer Box');
    const diffType = calculateSimilarity('Scarlet & Violet Elite Trainer Box', 'Scarlet & Violet Booster Pack');
    assert.ok(sameType > diffType, `Same type (${sameType}) should beat different type (${diffType})`);
  });
});

describe('MSRP — findMsrp (with temp database)', () => {
  const MOCK_DB = {
    products: [
      { name: 'Pokemon TCG: Scarlet & Violet Elite Trainer Box', price: 49.99, priceFormatted: '$49.99', url: null },
      { name: 'Pokemon TCG: Booster Pack', price: 4.99, priceFormatted: '$4.99', url: null },
      { name: 'Pokemon TCG: Premium Collection', price: 99.99, priceFormatted: '$99.99', url: null },
    ],
    lastUpdated: new Date().toISOString(),
    count: 3,
  };

  before(() => {
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(MOCK_DB));
  });

  after(() => {
    try { fs.unlinkSync(DB_FILE); } catch {}
  });

  it('finds exact match by name', () => {
    const result = findMsrp('Pokemon TCG: Scarlet & Violet Elite Trainer Box');
    assert.ok(result !== null);
    assert.equal(result.msrp, 49.99);
    assert.equal(result.exact, true);
  });

  it('fuzzy-matches a close name', () => {
    const result = findMsrp('Pokemon Scarlet & Violet Elite Trainer Box');
    assert.ok(result !== null);
    assert.equal(result.msrp, 49.99);
  });

  it('returns null for a completely unrelated name', () => {
    // Very unrelated — should fall below MIN_SIMILARITY threshold
    const result = findMsrp('Monopoly Board Game Classic Edition');
    assert.equal(result, null);
  });

  it('returns correct msrpFormatted string', () => {
    const result = findMsrp('Pokemon TCG Booster Pack');
    assert.ok(result !== null);
    assert.equal(result.msrpFormatted, '$4.99');
  });

  it('returns null when database is empty', () => {
    fs.writeFileSync(DB_FILE, JSON.stringify({ products: [], lastUpdated: null, count: 0 }));
    const result = findMsrp('Pokemon TCG ETB');
    assert.equal(result, null);
    // Restore for subsequent tests
    fs.writeFileSync(DB_FILE, JSON.stringify(MOCK_DB));
  });
});
