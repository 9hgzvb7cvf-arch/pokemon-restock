/**
 * Email notifier using nodemailer with Gmail SMTP (or any SMTP server).
 *
 * Setup (Gmail):
 *   1. Enable 2-Factor Authentication on your Google account
 *   2. Create an App Password: myaccount.google.com/apppasswords
 *   3. Set SMTP_USER=you@gmail.com and SMTP_PASS=<the 16-char app password>
 *
 * The SMTP transporter is created lazily on first use and reused across calls.
 * Credentials are verified at creation time; a clear error is logged on EAUTH.
 *
 * Email layout:
 *   Header   — gradient banner with alert count and timestamp
 *   Section  — "New Products" (one card per product, retailer-colour accent)
 *   Section  — "Restocked Products" (green accent) — only shown when present
 *   Footer   — "Sent by Pokemon TCG Monitor"
 *
 * Transient SMTP errors (connection reset, timeout) are retried up to MAX_RETRIES.
 * Auth errors (EAUTH / 535) are not retried — they require a config fix.
 */

const nodemailer = require('nodemailer');
const config     = require('../config');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

const RETAILER_HEX = {
  target:  '#cc0000',
  walmart: '#0071ce',
  bestbuy: '#ffe000',
};

// ── Transporter (lazy singleton) ──────────────────────────────────────────────

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const t = nodemailer.createTransport(config.email.smtp);

  // Fail fast with a clear message rather than a cryptic SMTP error at send time.
  try {
    await t.verify();
  } catch (err) {
    if (isAuthError(err)) {
      throw new Error(
        '[Email] SMTP authentication failed. ' +
        'For Gmail: enable 2FA and use an App Password (myaccount.google.com/apppasswords). ' +
        `Original: ${err.message}`,
      );
    }
    throw new Error(`[Email] SMTP connection failed: ${err.message}`);
  }

  _transporter = t;
  return _transporter;
}

function isAuthError(err) {
  return (
    err.code   === 'EAUTH'                              ||
    err.responseCode === 535                            ||
    /authentication|credentials|password|535/i.test(err.message ?? '')
  );
}

// ── HTML template ─────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function msrpLine(product) {
  if (!product.msrp) return '';
  const { msrp, msrpFormatted } = product.msrp;
  const retailerNum = product.priceNumeric;

  let text = `MSRP: ${esc(msrpFormatted)}`;
  if (retailerNum != null && msrp > 0) {
    const diff = retailerNum - msrp;
    const pct  = Math.round((diff / msrp) * 100);
    const sign = pct > 0 ? '+' : '';
    const col  = pct > 0 ? '#cc0000' : pct < 0 ? '#2d9e5e' : '#888888';
    text += ` <span style="color:${col};font-weight:bold">(${sign}${pct}%)</span>`;
  }
  return `<div style="font-size:13px;color:#666;margin-top:4px">${text}</div>`;
}

function productCard(product, accentColor) {
  const retailerName = esc(config.retailers[product.retailer]?.name ?? product.retailer);
  const isRestock    = product.changeType === 'restock';

  const badge = isRestock
    ? `<span style="background:#2d9e5e;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:bold">RESTOCK</span>`
    : `<span style="background:#555;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:bold">NEW</span>`;

  const wasBadge = isRestock && product.previousStockStatus
    ? `<div style="font-size:12px;color:#888;margin-top:4px">Previously: ${esc(product.previousStockStatus.replace(/_/g, ' '))}</div>`
    : '';

  return `
<div style="border:1px solid #e0e0e0;border-left:5px solid ${accentColor};border-radius:6px;margin:12px 0;padding:16px;background:#fff">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
    <div style="font-size:15px;font-weight:bold;color:#1a1a1a;flex:1">${esc(product.name)}</div>
    ${badge}
  </div>
  <div style="margin-top:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div>
      <div style="font-size:22px;font-weight:bold;color:#1a1a1a">${esc(product.price ?? 'N/A')}</div>
      ${msrpLine(product)}
    </div>
    <div style="font-size:13px;color:#555">
      <div>${retailerName}</div>
      ${product.releaseDate ? `<div style="margin-top:2px">Release: ${esc(product.releaseDate)}</div>` : ''}
      ${wasBadge}
    </div>
  </div>
  <div style="margin-top:14px">
    <a href="${esc(product.url ?? '#')}"
       style="display:inline-block;background:${accentColor};color:${accentColor === '#ffe000' ? '#000' : '#fff'};
              padding:8px 20px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:bold">
      Shop Now →
    </a>
  </div>
</div>`;
}

function sectionHeader(title) {
  return `<h2 style="font-size:16px;font-weight:bold;color:#333;margin:24px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px">${title}</h2>`;
}

function buildHtml(newProducts, restockedProducts) {
  const total    = newProducts.length + restockedProducts.length;
  const parts    = [];
  if (newProducts.length)     parts.push(`${newProducts.length} new`);
  if (restockedProducts.length) parts.push(`${restockedProducts.length} restocked`);
  const summary  = parts.join(' + ');
  const nowStr   = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const newCards = newProducts.map(p =>
    productCard(p, RETAILER_HEX[p.retailer] ?? '#7289da'),
  ).join('');

  const restockCards = restockedProducts.map(p =>
    productCard(p, '#2d9e5e'),
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pokemon TCG Alert</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:24px auto;background:#f4f4f4">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 32px;border-radius:8px 8px 0 0">
      <div style="font-size:22px;font-weight:bold;color:#fff">🃏 Pokemon TCG Monitor</div>
      <div style="font-size:14px;color:#aaa;margin-top:6px">${esc(summary)} product${total === 1 ? '' : 's'} detected · ${esc(nowStr)}</div>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:24px 32px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;border-top:none">

      ${newProducts.length ? sectionHeader(`🆕 New Products (${newProducts.length})`) + newCards : ''}
      ${restockedProducts.length ? sectionHeader(`🔄 Restocked (${restockedProducts.length})`) + restockCards : ''}

      <!-- Footer -->
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;text-align:center">
        Sent by Pokemon TCG Restock Monitor &mdash; prices and availability may have changed since this alert.
      </div>
    </div>

  </div>
</body>
</html>`;
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendMail(transporter, mailOptions, attempt = 1) {
  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (err) {
    // Auth errors are permanent — don't retry
    if (isAuthError(err)) throw err;

    const retryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED';
    if (retryable && attempt < MAX_RETRIES) {
      const delay = attempt * 3000;
      console.warn(`[Email] SMTP error on attempt ${attempt}: ${err.message} — retrying in ${delay / 1000}s`);
      await sleep(delay);
      return sendMail(transporter, mailOptions, attempt + 1);
    }

    throw err;
  }
}

/**
 * Send email notifications for new and/or restocked products.
 *
 * @param {object[]} products  All products to notify about (mix of new + restock)
 * @returns {Promise<{ sent: boolean, error: string|null }>}
 */
async function sendEmailNotification(products) {
  if (!config.email.enabled) {
    console.log('[Email] Disabled (EMAIL_ENABLED != true) — skipping.');
    return { sent: false, error: null };
  }
  if (!products.length) return { sent: false, error: null };

  const newProducts       = products.filter(p => p.changeType !== 'restock');
  const restockedProducts = products.filter(p => p.changeType === 'restock');
  const total = products.length;

  const parts = [];
  if (newProducts.length)     parts.push(`${newProducts.length} new`);
  if (restockedProducts.length) parts.push(`${restockedProducts.length} restocked`);
  const subject = `🃏 ${parts.join(' + ')} Pokemon TCG product${total === 1 ? '' : 's'} detected!`;

  let transporter;
  try {
    transporter = await getTransporter();
  } catch (err) {
    console.error(err.message);
    return { sent: false, error: err.message };
  }

  const html = buildHtml(newProducts, restockedProducts);

  try {
    const info = await sendMail(transporter, {
      from:    config.email.from,
      to:      config.email.to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${config.email.to} (messageId: ${info.messageId})`);
    return { sent: true, error: null };
  } catch (err) {
    if (isAuthError(err)) {
      const msg = `[Email] Authentication failed — check SMTP_USER and SMTP_PASS. ${err.message}`;
      console.error(msg);
      _transporter = null;  // force re-verify on next call after config is fixed
      return { sent: false, error: msg };
    }
    console.error(`[Email] Failed to send: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendEmailNotification, buildHtml };
