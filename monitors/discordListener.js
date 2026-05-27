/**
 * Discord webhook listener — receives restock alerts from external bots/services
 * and forwards them through the existing notification system.
 *
 * This is a persistent HTTP server (not part of the 15-minute GitHub Actions run).
 * Run it locally or on a VPS alongside monitor.js.
 *
 * How it works:
 *   Other Discord bots or services POST a JSON payload to this server's /alert
 *   endpoint. The server validates the request, parses the payload into a
 *   notification-compatible object, and calls notifier.notify().
 *
 * Incoming payload format (flexible — any of these work):
 *   { title, description, url, retailer, price }   ← simple format
 *   { embeds: [{ title, description, fields }] }    ← Discord embed format
 *   { content }                                      ← plain text
 *
 * Authentication:
 *   Set LISTENER_SECRET in .env. Every incoming request must include:
 *     Authorization: Bearer <LISTENER_SECRET>
 *   Without this header, requests are rejected with 401.
 *
 * Setup:
 *   1. Add LISTENER_SECRET=some-long-random-string to .env
 *   2. Run: node monitors/discordListener.js
 *   3. Server listens on LISTENER_PORT (default 3001)
 *   4. Configure external bots to POST to http://your-ip:3001/alert
 *      with Authorization: Bearer <your-secret>
 *
 * If running locally, use ngrok to expose it publicly:
 *   ngrok http 3001
 *
 * CLI:
 *   node monitors/discordListener.js            → start server
 *   node monitors/discordListener.js --test     → send a test POST to itself
 */

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const notifierMod  = require('../notifier');
const config       = require('../config');

// ── Constants ─────────────────────────────────────────────────────────────────

const PORT   = parseInt(process.env.LISTENER_PORT || '3001', 10);
const SECRET = process.env.LISTENER_SECRET || '';

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkAuth(req, res) {
  if (!SECRET) {
    console.warn('[Listener] WARNING: LISTENER_SECRET is not set — all requests accepted. Set it in .env.');
    return true;
  }
  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ── Payload parsing ───────────────────────────────────────────────────────────

// Known restock signal keywords used to score plain-text payloads.
const RESTOCK_KEYWORDS = ['restock', 'in stock', 'available', 'back in stock', 'live', 'dropped'];

function parsePayload(body) {
  // Discord embed format
  if (Array.isArray(body.embeds) && body.embeds.length) {
    const embed = body.embeds[0];
    const fields = embed.fields ?? [];
    const priceField  = fields.find(f => /price/i.test(f.name));
    const retailField = fields.find(f => /retailer|store|shop/i.test(f.name));
    const urlField    = fields.find(f => /link|url/i.test(f.name));

    return {
      name:     embed.title ?? body.content ?? 'Community Alert',
      retailer: retailField?.value ?? guessRetailer(embed.title ?? ''),
      price:    priceField?.value  ?? null,
      url:      embed.url ?? urlField?.value ?? null,
      source:   'discord_embed',
      raw:      embed.description ?? body.content ?? '',
    };
  }

  // Simple JSON format
  if (body.title || body.description) {
    return {
      name:     body.title ?? body.description ?? 'Community Alert',
      retailer: body.retailer ?? guessRetailer(body.title ?? body.description ?? ''),
      price:    body.price ?? null,
      url:      body.url ?? null,
      source:   'json',
      raw:      body.description ?? '',
    };
  }

  // Plain text content
  if (body.content) {
    return {
      name:     truncate(body.content, 200),
      retailer: guessRetailer(body.content),
      price:    null,
      url:      extractUrl(body.content),
      source:   'text',
      raw:      body.content,
    };
  }

  return null;
}

function guessRetailer(text) {
  const t = (text ?? '').toLowerCase();
  if (t.includes('target'))                    return 'Target';
  if (t.includes('walmart'))                   return 'Walmart';
  if (t.includes('best buy') || t.includes('bestbuy')) return 'Best Buy';
  if (t.includes('amazon'))                    return 'Amazon';
  if (t.includes('gamestop'))                  return 'GameStop';
  if (t.includes('barnes') || t.includes('b&n')) return 'Barnes & Noble';
  if (t.includes('pokemon center'))            return 'Pokemon Center';
  if (t.includes('costco'))                    return 'Costco';
  return 'Unknown';
}

function extractUrl(text) {
  const match = (text ?? '').match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function isRestockSignal(parsed) {
  const text = `${parsed.name} ${parsed.raw}`.toLowerCase();
  return RESTOCK_KEYWORDS.some(k => text.includes(k));
}

// ── Normalize to notification object ──────────────────────────────────────────

function toNotification(parsed) {
  const priceNumeric = parsed.price ? parseFloat(parsed.price.replace(/[^0-9.]/g, '')) : null;

  return {
    id:           `listener-${Date.now()}`,
    retailer:     'community',
    name:         parsed.name,
    brand:        null,
    price:        parsed.price ?? 'N/A',
    priceNumeric: isNaN(priceNumeric) ? null : priceNumeric,
    regularPrice: null,
    url:          parsed.url ?? null,
    inStock:      true,
    stockStatus:  'in_stock',
    changeType:   'community_alert',
    source:       parsed.source,
    retailerHint: parsed.retailer,
    releaseDate:  null,
  };
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.text({ limit: '100kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Main alert endpoint
app.post('/alert', async (req, res) => {
  if (!checkAuth(req, res)) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = { content: body }; }
  }

  const parsed = parsePayload(body);
  if (!parsed) {
    return res.status(400).json({ error: 'Could not parse payload — send { title, url } or Discord embed format' });
  }

  if (!isRestockSignal(parsed)) {
    console.log(`[Listener] Received post but no restock signal found — ignoring: "${truncate(parsed.name, 60)}"`);
    return res.json({ accepted: false, reason: 'no restock signal in content' });
  }

  const notification = toNotification(parsed);
  console.log(`[Listener] Restock alert received: "${truncate(notification.name, 80)}" from ${parsed.source}`);

  try {
    const results = await notifierMod.notify([notification]);
    console.log('[Listener] Forwarded to notifier:', JSON.stringify(results));
    res.json({ accepted: true, results });
  } catch (err) {
    console.error(`[Listener] Notify failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to forward notification' });
  }
});

// Reject unknown routes
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args   = process.argv.slice(2);
  const doTest = args.includes('--test');

  if (!SECRET) {
    console.warn('[Listener] WARNING: LISTENER_SECRET is not set. Set it in .env to secure this endpoint.');
  }

  const server = app.listen(PORT, () => {
    console.log(`[Listener] Webhook receiver running on port ${PORT}`);
    console.log(`[Listener] POST alerts to: http://localhost:${PORT}/alert`);
    console.log(`[Listener] Health check:   http://localhost:${PORT}/health`);
    if (!SECRET) {
      console.warn('[Listener] No auth — set LISTENER_SECRET in .env before exposing publicly.');
    }
  });

  if (doTest) {
    // Self-test: POST a sample payload to the running server
    setTimeout(() => {
      console.log('\n[Listener] Sending self-test alert…');
      const payload = JSON.stringify({
        title:    'Pokemon TCG Scarlet Violet Booster Box back in stock at Target',
        url:      'https://www.target.com/p/-/A-example',
        retailer: 'Target',
        price:    '$143.99',
      });

      const opts = {
        hostname: 'localhost',
        port:     PORT,
        path:     '/alert',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization':  `Bearer ${SECRET || 'no-secret'}`,
        },
      };

      const req = http.request(opts, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          console.log(`[Listener] Self-test response (${res.statusCode}):`, data);
          server.close();
        });
      });
      req.on('error', err => { console.error('[Listener] Self-test error:', err.message); server.close(); });
      req.write(payload);
      req.end();
    }, 500);
  }
}

module.exports = { app };
