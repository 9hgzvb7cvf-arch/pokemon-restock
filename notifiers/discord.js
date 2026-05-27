/**
 * Discord webhook notifier.
 *
 * Sends product embeds grouped by retailer, up to 10 per message (Discord cap).
 * Handles rate-limiting (429) by reading the Retry-After header and backing off.
 *
 * Embed colour scheme:
 *   New product → retailer brand colour (Target red / Walmart blue / Best Buy yellow)
 *   Restock     → 0x57F287 (Discord green) — "available again" visual signal
 *
 * If the product has changeType === 'restock', the embed title gets a "🔄 RESTOCK:"
 * prefix and a "Was" field shows the previous stock status.
 *
 * Discord webhook limits:
 *   10 embeds per message · 6 000 total chars across all embeds · 256 chars per title
 *   Rate limit: 5 requests / 2 s per webhook, then 429 with Retry-After (seconds)
 */

const axios = require('axios');
const config = require('../config');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRIES   = 3;
const EMBEDS_PER_MSG = 10;  // Discord hard limit

const RETAILER_COLORS = {
  target:         0xcc0000,
  walmart:        0x0071ce,
  bestbuy:        0xffe000,
  amazon:         0xff9900,
  gamestop:       0xe31837,
  barnesandnoble: 0x1d6b3d,
};

const RETAILER_ICONS = {
  target:         'https://corporate.target.com/images/logo/Target_Bullseye_Logo.png',
  walmart:        'https://i5.walmartimages.com/dfw/4ff9c6c9-d8b6/k2-_7a3.image.75x75.jpg',
  bestbuy:        'https://pisces.bbystatic.com/image2/BestBuy_US/images/logos/BestBuy_Logo_2020.png',
  amazon:         'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/320px-Amazon_logo.svg.png',
  gamestop:       'https://www.gamestop.com/on/demandware.static/Sites-gamestop-us-Site/-/default/dwbf2ed3c5/images/gamestop-logo.png',
  barnesandnoble: 'https://www.barnesandnoble.com/favicon.ico',
};

const RESTOCK_COLOR = 0x57f287;  // Discord "green" — signals available-again

const STOCK_LABEL = {
  in_stock:     '✅ In Stock',
  out_of_stock: '❌ Out of Stock',
  pre_order:    '🔜 Pre-Order',
};

// ── HTTP ──────────────────────────────────────────────────────────────────────

/**
 * POST payload to the Discord webhook, retrying on 429 and transient server errors.
 * Returns true on success, false on permanent failure.
 */
async function postWebhook(url, payload, attempt = 1) {
  try {
    await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return true;
  } catch (err) {
    const status = err.response?.status;

    if (status === 429) {
      const retryAfter = parseFloat(err.response.headers['retry-after'] ?? '2');
      const delayMs    = Math.ceil(retryAfter * 1000) + 200;  // small buffer over the header value
      console.warn(`[Discord] Rate limited — waiting ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${MAX_RETRIES})`);
      if (attempt < MAX_RETRIES) {
        await sleep(delayMs);
        return postWebhook(url, payload, attempt + 1);
      }
      console.error('[Discord] Rate limit retries exhausted');
      return false;
    }

    if (status === 400) {
      // Bad payload — log the Discord error body so we can debug embed structure issues
      const body = err.response?.data;
      console.error(`[Discord] 400 Bad Request: ${JSON.stringify(body)}`);
      return false;
    }

    const retryable = !status || status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
    if (retryable && attempt < MAX_RETRIES) {
      const delay = attempt * 2000;
      console.warn(`[Discord] Attempt ${attempt} failed (${err.message}) — retrying in ${delay / 1000}s`);
      await sleep(delay);
      return postWebhook(url, payload, attempt + 1);
    }

    console.error(`[Discord] Failed to send: ${err.message}`);
    return false;
  }
}

// ── Embed builders ────────────────────────────────────────────────────────────

function buildMsrpField(product) {
  if (!product.msrp) {
    return { name: 'MSRP', value: 'No match on Pokemon Center', inline: false };
  }

  const { msrp, msrpFormatted } = product.msrp;
  const retailerNum = product.priceNumeric;

  let label = `MSRP: ${msrpFormatted}`;
  if (retailerNum != null && msrp > 0) {
    const diff    = retailerNum - msrp;
    const pct     = Math.round((diff / msrp) * 100);
    const sign    = pct > 0 ? '+' : '';
    const color   = pct > 0 ? '🔴' : pct < 0 ? '🟢' : '⚪';
    label += ` ${color} (${sign}${pct}%)`;
  }

  return { name: 'MSRP', value: label, inline: false };
}

function buildEmbed(product, retailer) {
  const isRestock  = product.changeType === 'restock';
  const retailerName = config.retailers[retailer]?.name ?? retailer;
  const color      = isRestock ? RESTOCK_COLOR : (RETAILER_COLORS[retailer] ?? 0x7289da);

  const fields = [
    { name: 'Price',    value: product.price ?? 'N/A',          inline: true  },
    { name: 'Status',   value: STOCK_LABEL[product.stockStatus] ?? '✅ In Stock', inline: true },
    { name: 'Retailer', value: retailerName,                    inline: true  },
    buildMsrpField(product),
  ];

  if (isRestock && product.previousStockStatus) {
    fields.push({
      name:   'Was',
      value:  STOCK_LABEL[product.previousStockStatus] ?? product.previousStockStatus,
      inline: true,
    });
  }

  if (product.releaseDate) {
    fields.push({ name: 'Release Date', value: product.releaseDate, inline: true });
  }

  const title = isRestock
    ? `🔄 RESTOCK: ${product.name}`
    : `🆕 ${product.name}`;

  return {
    title:  truncate(title, 256),
    url:    product.url ?? undefined,
    color,
    fields,
    thumbnail: RETAILER_ICONS[retailer] ? { url: RETAILER_ICONS[retailer] } : undefined,
    timestamp: new Date().toISOString(),
    footer:    { text: 'Pokemon TCG Monitor' },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Send Discord webhook notifications for one or more products.
 * Products are grouped by retailer; each group may generate multiple messages
 * if it exceeds the 10-embed-per-message limit.
 *
 * @param {object[]} products  Normalised product objects from stateManager
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendDiscordNotification(products) {
  const webhookUrl = config.discord.webhookUrl;
  if (!webhookUrl) {
    console.warn('[Discord] No DISCORD_WEBHOOK_URL set — skipping.');
    return { sent: 0, failed: 0 };
  }
  if (!products.length) return { sent: 0, failed: 0 };

  // Group by retailer
  const byRetailer = new Map();
  for (const product of products) {
    const r = product.retailer ?? 'unknown';
    if (!byRetailer.has(r)) byRetailer.set(r, []);
    byRetailer.get(r).push(product);
  }

  let sent = 0, failed = 0;

  for (const [retailer, group] of byRetailer) {
    const retailerName = config.retailers[retailer]?.name ?? retailer;
    const newCount     = group.filter(p => p.changeType !== 'restock').length;
    const restockCount = group.filter(p => p.changeType === 'restock').length;

    const parts = [];
    if (newCount)     parts.push(`🆕 **${newCount}** new`);
    if (restockCount) parts.push(`🔄 **${restockCount}** restocked`);
    const headline = `🃏 ${parts.join(' + ')} Pokemon TCG product${group.length === 1 ? '' : 's'} at **${retailerName}**!`;

    // Batch into groups of 10 (Discord embed limit per message)
    const batches = chunk(group, EMBEDS_PER_MSG);

    for (let i = 0; i < batches.length; i++) {
      const batch  = batches[i];
      const embeds = batch.map(p => buildEmbed(p, retailer));

      const payload = {
        username: 'Pokemon TCG Monitor',
        content:  i === 0 ? headline : `_(continued — page ${i + 1}/${batches.length})_`,
        embeds,
      };

      const ok = await postWebhook(webhookUrl, payload);
      if (ok) {
        console.log(`[Discord] Sent ${batch.length} embed(s) for ${retailerName} (batch ${i + 1}/${batches.length})`);
        sent += batch.length;
      } else {
        failed += batch.length;
      }

      // Polite gap between batches to avoid hitting the rate limit
      if (i < batches.length - 1) await sleep(1500);
    }
  }

  return { sent, failed };
}

// ── Queue alert ───────────────────────────────────────────────────────────────

/**
 * Send an immediate CRITICAL alert when a Pokemon Center queue is detected live.
 *
 * @param {object} queueEvent  QueueEvent object from scrapePokemonCenter()
 * @returns {Promise<{ sent: boolean, error: string|null }>}
 */
async function sendQueueAlert(queueEvent) {
  const webhookUrl = config.discord.webhookUrl;
  if (!webhookUrl) {
    console.warn('[Discord] No DISCORD_WEBHOOK_URL set — skipping queue alert.');
    return { sent: false, error: null };
  }

  const { queueUrl, position, waitTime, products: watchedProducts, detectedAt, detectionMethod } = queueEvent;

  const fields = [];

  if (position != null) {
    fields.push({ name: 'Queue Position', value: String(position), inline: true });
  }
  if (waitTime) {
    fields.push({ name: 'Est. Wait',      value: waitTime,         inline: true });
  }
  fields.push({ name: 'Detected via', value: detectionMethod ?? 'unknown', inline: true });

  if (watchedProducts?.length) {
    fields.push({ name: 'Likely Products', value: watchedProducts.slice(0, 5).join('\n'), inline: false });
  }

  fields.push({
    name:   'Queue Link',
    value:  queueUrl ? `[Join Queue](${queueUrl})` : 'Check pokemoncenter.com',
    inline: false,
  });

  const embed = {
    title:       '🚨 POKEMON CENTER QUEUE IS LIVE',
    description: 'A restock queue has been detected. Act fast — these sell out in minutes.',
    color:       0xff0000,
    fields,
    timestamp:   detectedAt ?? new Date().toISOString(),
    footer:      { text: 'Pokemon TCG Monitor · Queue Alert' },
  };

  const mentionEveryone = config.retailers?.pokemoncenter?.mentionEveryone ?? false;

  const payload = {
    username: 'Pokemon TCG Monitor',
    content:  mentionEveryone ? '@here 🚨 **POKEMON CENTER QUEUE IS LIVE!**' : '🚨 **POKEMON CENTER QUEUE IS LIVE!**',
    embeds:   [embed],
  };

  const ok = await postWebhook(webhookUrl, payload);
  if (ok) {
    console.log('[Discord] Queue alert sent.');
    return { sent: true, error: null };
  }
  return { sent: false, error: 'postWebhook returned false' };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendDiscordNotification, sendQueueAlert, buildEmbed, buildMsrpField };
