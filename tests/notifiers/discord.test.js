const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios  = require('axios');

const { buildEmbed, buildMsrpField, sendDiscordNotification } = require('../../notifiers/discord');
const config = require('../../config');

const makeProduct = (overrides = {}) => ({
  id:                  'target-111',
  retailer:            'target',
  name:                'Pokemon TCG Elite Trainer Box',
  price:               '$49.99',
  priceNumeric:        49.99,
  url:                 'https://www.target.com/p/-/A-111',
  inStock:             true,
  stockStatus:         'in_stock',
  changeType:          'new',
  msrp:                null,
  releaseDate:         null,
  previousStockStatus: null,
  ...overrides,
});

describe('Discord — buildMsrpField', () => {
  it('returns "No match" field when msrp is null', () => {
    const field = buildMsrpField(makeProduct({ msrp: null }));
    assert.ok(field.value.toLowerCase().includes('no match'));
  });

  it('shows green 🟢 when price is below MSRP', () => {
    const product = makeProduct({ priceNumeric: 39.99, msrp: { msrp: 49.99, msrpFormatted: '$49.99' } });
    const field = buildMsrpField(product);
    assert.ok(field.value.includes('🟢'));
  });

  it('shows red 🔴 when price is above MSRP', () => {
    const product = makeProduct({ priceNumeric: 59.99, msrp: { msrp: 49.99, msrpFormatted: '$49.99' } });
    const field = buildMsrpField(product);
    assert.ok(field.value.includes('🔴'));
  });

  it('shows ⚪ when price equals MSRP', () => {
    const product = makeProduct({ priceNumeric: 49.99, msrp: { msrp: 49.99, msrpFormatted: '$49.99' } });
    const field = buildMsrpField(product);
    assert.ok(field.value.includes('⚪'));
  });
});

describe('Discord — buildEmbed', () => {
  it('uses retailer color for new products', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'new' }), 'target');
    assert.equal(embed.color, 0xcc0000);  // Target red
  });

  it('uses green restock color for restocked products', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'restock' }), 'target');
    assert.equal(embed.color, 0x57f287);
  });

  it('prefixes title with 🆕 for new products', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'new' }), 'target');
    assert.ok(embed.title.startsWith('🆕'));
  });

  it('prefixes title with 🔄 RESTOCK for restocked products', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'restock' }), 'target');
    assert.ok(embed.title.startsWith('🔄 RESTOCK:'));
  });

  it('includes a "Was" field when previousStockStatus is set', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'restock', previousStockStatus: 'out_of_stock' }), 'target');
    const wasField = embed.fields.find(f => f.name === 'Was');
    assert.ok(wasField, 'Expected a "Was" field');
  });

  it('does not include "Was" field for new products', () => {
    const embed = buildEmbed(makeProduct({ changeType: 'new' }), 'target');
    const wasField = embed.fields.find(f => f.name === 'Was');
    assert.equal(wasField, undefined);
  });

  it('includes Release Date field when releaseDate is set', () => {
    const embed = buildEmbed(makeProduct({ releaseDate: '2026-06-01' }), 'target');
    const relField = embed.fields.find(f => f.name === 'Release Date');
    assert.ok(relField);
    assert.equal(relField.value, '2026-06-01');
  });

  it('truncates very long titles to 256 chars', () => {
    const longName = 'A'.repeat(300);
    const embed = buildEmbed(makeProduct({ name: longName }), 'target');
    assert.ok(embed.title.length <= 256);
  });

  it('sets embed url to product url', () => {
    const embed = buildEmbed(makeProduct(), 'target');
    assert.equal(embed.url, 'https://www.target.com/p/-/A-111');
  });
});

describe('Discord — sendDiscordNotification', () => {
  let origPost;
  let origWebhook;

  beforeEach(() => {
    origPost    = axios.post;
    origWebhook = config.discord.webhookUrl;
    config.discord.webhookUrl = 'https://discord.com/api/webhooks/test/token';
  });

  afterEach(() => {
    axios.post                = origPost;
    config.discord.webhookUrl = origWebhook;
  });

  it('returns { sent: 0, failed: 0 } with no webhook configured', async () => {
    config.discord.webhookUrl = '';
    const result = await sendDiscordNotification([makeProduct()]);
    assert.deepEqual(result, { sent: 0, failed: 0 });
  });

  it('returns { sent: 0, failed: 0 } for empty product list', async () => {
    const result = await sendDiscordNotification([]);
    assert.deepEqual(result, { sent: 0, failed: 0 });
  });

  it('posts to webhook and returns sent count', async () => {
    const calls = [];
    axios.post = async (url, payload) => { calls.push({ url, payload }); return { status: 204 }; };

    const result = await sendDiscordNotification([makeProduct()]);
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 0);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('discord.com'));
  });

  it('sends multiple messages when products exceed 10 (embed limit)', async () => {
    const calls = [];
    axios.post = async (url, payload) => { calls.push(payload); return { status: 204 }; };

    const products = Array.from({ length: 12 }, (_, i) =>
      makeProduct({ id: `target-${i}`, changeType: 'new' }),
    );

    const result = await sendDiscordNotification(products);
    assert.equal(result.sent, 12);
    assert.equal(calls.length, 2);  // 10 + 2
    assert.equal(calls[0].embeds.length, 10);
    assert.equal(calls[1].embeds.length, 2);
  });

  it('increments failed count when post throws', async () => {
    // Use a 400 status so postWebhook treats it as permanent (no retries, no sleep)
    const err = Object.assign(new Error('bad payload'), { response: { status: 400, data: {} } });
    axios.post = async () => { throw err; };

    const result = await sendDiscordNotification([makeProduct()]);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
  });
});
