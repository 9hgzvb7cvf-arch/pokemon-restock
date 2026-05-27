require('dotenv').config();

const keywords = (process.env.SEARCH_KEYWORDS || 'pokemon trading card game,pokemon tcg booster,pokemon elite trainer box')
  .split(',').map(k => k.trim()).filter(Boolean);

const filterKeywords = (process.env.FILTER_KEYWORDS || 'booster,elite trainer,etb,tin,collection,bundle,box,pack')
  .split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

module.exports = {
  notify: {
    // Which channels to route notifications through.
    // Valid values: 'discord', 'email'  (comma-separated)
    // Each channel also requires its own credentials to be set (see below).
    channels: (process.env.NOTIFY_CHANNELS || 'discord,email')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  },

  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },

  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    from: process.env.EMAIL_FROM || '',
    to: process.env.EMAIL_TO || '',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    },
  },

  retailers: {
    target: {
      enabled: process.env.TARGET_ENABLED !== 'false',
      name: 'Target',
      color: 0xcc0000,
      keywords,
    },
    walmart: {
      enabled: process.env.WALMART_ENABLED !== 'false',
      name: 'Walmart',
      color: 0x0071ce,
      keywords,
    },
    bestbuy: {
      enabled: process.env.BESTBUY_ENABLED !== 'false',
      name: 'Best Buy',
      color: 0xffe000,
      apiKey: process.env.BESTBUY_API_KEY || '',
      keywords,
    },
    amazon: {
      enabled:    process.env.AMAZON_ENABLED !== 'false',
      name:       'Amazon',
      color:      0xff9900,
      accessKey:  process.env.AMAZON_ACCESS_KEY  || '',
      secretKey:  process.env.AMAZON_SECRET_KEY  || '',
      partnerTag: process.env.AMAZON_PARTNER_TAG || '',
      // true  → include 3rd-party FBA/Prime-eligible sellers
      // false → only items sold directly by Amazon.com (default; safer for MSRP)
      fbaOnly:    process.env.AMAZON_FBA_ONLY === 'true',
    },
    gamestop: {
      // Disabled by default: GameStop uses Cloudflare Enterprise which blocks server-side
      // HTTP requests (GitHub Actions, VPS, etc.). Enable only if you have a residential
      // proxy configured or are running monitor.js locally from a home IP.
      enabled: process.env.GAMESTOP_ENABLED === 'true',
      name:    'GameStop',
      color:   0xe31837,
      keywords,
    },
    barnesandnoble: {
      enabled: process.env.BN_ENABLED !== 'false',
      name:    'Barnes & Noble',
      color:   0x1d6b3d,
      keywords,
    },
  },

  filterKeywords,
  maxPages: parseInt(process.env.MAX_PAGES || '3', 10),
  dataFile: './data/products.json',
  checkInterval: '*/15 * * * *',

  requestHeaders: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  },
};
