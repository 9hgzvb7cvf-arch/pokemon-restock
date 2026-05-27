/**
 * notifier.js — unified notification orchestrator.
 *
 * Routes products to one or more notification channels based on NOTIFY_CHANNELS.
 * Each channel has its own enable guard (DISCORD_WEBHOOK_URL / EMAIL_ENABLED),
 * so NOTIFY_CHANNELS is the routing layer on top:
 *
 *   Channel runs when:
 *     'discord' in NOTIFY_CHANNELS  AND  DISCORD_WEBHOOK_URL is set
 *     'email'   in NOTIFY_CHANNELS  AND  EMAIL_ENABLED=true AND SMTP configured
 *
 * Public API:
 *   notify(products)             — send to all configured channels; returns results map
 *   test(channels?)              — send a mock product; channels defaults to NOTIFY_CHANNELS
 *
 * CLI:
 *   node notifier.js             — print channel configuration summary
 *   node notifier.js --test      — send a test notification to all configured channels
 *   node notifier.js --test --channel discord
 *   node notifier.js --test --channel email
 */

require('dotenv').config();

const config  = require('./config');
const discord = require('./notifiers/discord');
const email   = require('./notifiers/email');

// ── Channel registry ──────────────────────────────────────────────────────────

const CHANNELS = {
  discord: {
    label:   'Discord',
    enabled: () => !!config.discord.webhookUrl,
    send:    (products) => discord.sendDiscordNotification(products),
  },
  email: {
    label:   'Email',
    enabled: () => config.email.enabled && !!config.email.smtp?.auth?.user,
    send:    (products) => email.sendEmailNotification(products),
  },
};

// ── Routing ───────────────────────────────────────────────────────────────────

/**
 * Returns the list of channel keys that are both in NOTIFY_CHANNELS and
 * individually configured (have their credentials set).
 */
function activeChannels(overrideList) {
  const requested = overrideList ?? config.notify.channels;
  return requested.filter(key => {
    const ch = CHANNELS[key];
    if (!ch) {
      console.warn(`[Notifier] Unknown channel "${key}" — check NOTIFY_CHANNELS`);
      return false;
    }
    return true;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Dispatch products to all active notification channels in parallel.
 *
 * @param {object[]} products  Normalised product objects (from stateManager).
 *                             Each must have changeType: 'new' | 'restock'.
 * @param {string[]} [channels]  Override channel list (defaults to config.notify.channels)
 * @returns {Promise<Object.<string, any>>}  Map of channel key → result from each sender
 */
async function notify(products, channels) {
  if (!products.length) {
    console.log('[Notifier] No products to notify about.');
    return {};
  }

  const keys = activeChannels(channels);
  if (!keys.length) {
    console.warn('[Notifier] No channels configured — nothing sent. Set NOTIFY_CHANNELS and channel credentials.');
    return {};
  }

  const newCount     = products.filter(p => p.changeType !== 'restock').length;
  const restockCount = products.filter(p => p.changeType === 'restock').length;
  const parts = [];
  if (newCount)     parts.push(`${newCount} new`);
  if (restockCount) parts.push(`${restockCount} restock`);
  console.log(`[Notifier] Dispatching ${parts.join(' + ')} product(s) to: ${keys.join(', ')}`);

  const results = await Promise.allSettled(
    keys.map(key => CHANNELS[key].send(products).then(r => ({ key, result: r })))
  );

  const out = {};
  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      out[settled.value.key] = settled.value.result;
    } else {
      // Uncaught throw from a channel sender — shouldn't happen, but catch defensively
      const key = keys[results.indexOf(settled)];
      console.error(`[Notifier] ${key} threw unexpectedly: ${settled.reason?.message}`);
      out[key] = { error: settled.reason?.message };
    }
  }

  return out;
}

// ── Critical alert (queue events) ─────────────────────────────────────────────

/**
 * Fire an immediate critical notification for a Pokemon Center queue event.
 * Bypasses NOTIFY_CHANNELS filtering — fires to every channel that has credentials,
 * because a live queue is time-sensitive and should reach all configured outputs.
 *
 * @param {object} queueEvent  QueueEvent from scrapePokemonCenter()
 * @returns {Promise<Object.<string, any>>}
 */
async function notifyCritical(queueEvent) {
  console.log('[Notifier] CRITICAL: dispatching queue alert to all configured channels.');

  const tasks = [];

  if (config.discord.webhookUrl) {
    tasks.push(
      discord.sendQueueAlert(queueEvent)
        .then(r => ({ key: 'discord', result: r }))
        .catch(err => ({ key: 'discord', result: { sent: false, error: err.message } })),
    );
  }

  if (config.email.enabled && config.email.smtp?.auth?.user) {
    tasks.push(
      email.sendQueueAlertEmail(queueEvent)
        .then(r => ({ key: 'email', result: r }))
        .catch(err => ({ key: 'email', result: { sent: false, error: err.message } })),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const out = {};
  for (const s of settled) {
    if (s.status === 'fulfilled') out[s.value.key] = s.value.result;
  }
  return out;
}

// ── Test helper ───────────────────────────────────────────────────────────────

const TEST_PRODUCTS = [
  {
    id:                   'target-999001',
    retailer:             'target',
    name:                 'Pokemon TCG: Scarlet & Violet — Twilight Masquerade Elite Trainer Box',
    brand:                'The Pokemon Company',
    price:                '$49.99',
    priceNumeric:         49.99,
    regularPrice:         null,
    url:                  'https://www.target.com/p/-/A-99001',
    inStock:              true,
    stockStatus:          'in_stock',
    changeType:           'new',
    releaseDate:          null,
    msrp:                 { msrp: 49.99, msrpFormatted: '$49.99', similarity: 0.92, exact: false },
  },
  {
    id:                   'walmart-999002',
    retailer:             'walmart',
    name:                 'Pokemon TCG: Stellar Crown Booster Pack',
    brand:                null,
    price:                '$4.49',
    priceNumeric:         4.49,
    regularPrice:         '$4.99',
    url:                  'https://www.walmart.com/ip/999002',
    inStock:              true,
    stockStatus:          'in_stock',
    changeType:           'restock',
    previousStockStatus:  'out_of_stock',
    releaseDate:          null,
    msrp:                 { msrp: 4.99, msrpFormatted: '$4.99', similarity: 0.88, exact: false },
  },
  {
    id:                   'bestbuy-999003',
    retailer:             'bestbuy',
    name:                 'Pokemon TCG: Prismatic Evolutions Super Premium Collection',
    brand:                'The Pokemon Company',
    price:                '$119.99',
    priceNumeric:         119.99,
    regularPrice:         null,
    url:                  'https://www.bestbuy.com/site/-/999003.p',
    inStock:              true,
    stockStatus:          'in_stock',
    changeType:           'restock',
    previousStockStatus:  'pre_order',
    releaseDate:          '2026-03-28',
    msrp:                 null,
  },
];

/**
 * Send a test notification with mock products.
 *
 * @param {string[]} [channels]  Specific channels to test; defaults to all configured.
 */
async function test(channels) {
  const keys = activeChannels(channels);

  if (!keys.length) {
    console.warn('[Notifier] No channels to test. Check NOTIFY_CHANNELS and channel credentials.');
    return {};
  }

  console.log(`[Notifier] Sending test notification to: ${keys.join(', ')}`);
  console.log(`[Notifier] Test payload: ${TEST_PRODUCTS.length} mock products (1 new, 2 restocks)`);

  return notify(TEST_PRODUCTS, keys);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args        = process.argv.slice(2);
  const doTest      = args.includes('--test');
  const chanIdx     = args.indexOf('--channel');
  const chanOverride = chanIdx !== -1 ? [args[chanIdx + 1]].filter(Boolean) : undefined;

  if (doTest) {
    test(chanOverride)
      .then(results => {
        console.log('\n[Notifier] Test results:');
        for (const [key, result] of Object.entries(results)) {
          console.log(`  ${CHANNELS[key]?.label ?? key}: ${JSON.stringify(result)}`);
        }
      })
      .catch(err => {
        console.error('[Notifier] Fatal:', err.message);
        process.exit(1);
      });
    return;
  }

  // Default: print configuration summary
  console.log('\nNotifier configuration');
  console.log('─'.repeat(50));
  console.log(`NOTIFY_CHANNELS: ${config.notify.channels.join(', ') || '(none)'}`);
  console.log('');

  for (const [key, ch] of Object.entries(CHANNELS)) {
    const inChannels = config.notify.channels.includes(key);
    const configured = ch.enabled();
    const status     = !inChannels       ? '⚫ excluded from NOTIFY_CHANNELS'
                     : !configured       ? '🔴 missing credentials'
                     :                     '🟢 ready';
    console.log(`  ${ch.label.padEnd(10)} ${status}`);
  }

  console.log('');
  console.log('Run with --test to send a test notification.');
  console.log('Run with --test --channel discord|email to test one channel.');
  console.log('');
}

module.exports = { notify, notifyCritical, test };
