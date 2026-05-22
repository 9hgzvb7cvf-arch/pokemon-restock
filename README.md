# Pokemon TCG Restock Monitor

Automatically watches Target, Walmart, and Best Buy for Pokemon Trading Card Game products — new listings and restocks — and sends alerts to Discord and/or email the moment they appear.

Runs free on GitHub Actions every 15 minutes. No server required.

---

## Features

- **Three retailers** — Target, Walmart, and Best Buy scraped in parallel on every run
- **Smart change detection** — alerts only on genuinely new products and OOS/pre-order → in-stock transitions; no spam for products already seen
- **MSRP price gate** — cross-references Pokemon Center's live catalog; skips products priced more than 20% above MSRP (scalper listings)
- **Discord webhooks** — rich embeds with product name, price, MSRP comparison, retailer badge, and a direct Shop Now link
- **Email alerts** — styled HTML cards grouped by New / Restocked, sent via Gmail or any SMTP server
- **First-run baseline** — on initial setup, silently snapshots current inventory so only future changes trigger alerts
- **Dry-run mode** — full scrape and compare without sending notifications or writing state, for local testing
- **GitHub Actions ready** — built-in workflow with concurrency control, data file commits, and Discord failure alerts

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Bundled with Node |
| Git | any | [git-scm.com](https://git-scm.com) |
| Discord server | — | Only if using Discord notifications |
| Gmail account | — | Only if using email notifications |
| Best Buy API key | free | Only for Best Buy scraping |

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/pokemon-restock-monitor.git
cd pokemon-restock-monitor
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials. At minimum, set `DISCORD_WEBHOOK_URL` (see below).

### 3. Initialize the baseline

This first run snapshots everything currently in stock so future runs only alert on genuine changes:

```bash
node monitor.js --once --init
```

You should see output like:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pokemon TCG Monitor  ·  2026-05-22T10:00:00.000Z  [INIT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/3] MSRP database
   ✓ 847 products · 2m old  (3.2s)

[2/3] Scraping retailers  (Target + Walmart + Best Buy — parallel)
   ✓ Target     24 product(s)  (4.1s)
   ✓ Walmart    18 product(s)  (3.8s)
   ✓ Best Buy   31 product(s)  (2.2s)

[3/3] Baseline initialization  (first run — no notifications)
   ✓ target     24 products baselined
   ✓ walmart    18 products baselined
   ✓ bestbuy    31 products baselined

     73 total products saved as baseline. Next run will detect changes.

Baseline complete  ·  12.3s
```

### 4. Run a dry-run to verify

```bash
node monitor.js --once --test
```

This scrapes and compares against the baseline but sends no notifications and writes no state.

### 5. Run continuously (local cron)

```bash
node monitor.js
```

Starts immediately, then repeats every 15 minutes using the built-in scheduler. Use GitHub Actions instead for unattended operation.

---

## Getting a Discord Webhook URL

1. Open Discord and go to the server where you want alerts
2. Click the gear icon next to any text channel → **Edit Channel**
3. Click **Integrations** in the left sidebar
4. Click **Webhooks** → **New Webhook**
5. Give it a name (e.g. "Pokemon TCG Monitor") and optionally set an avatar
6. Click **Copy Webhook URL**
7. Paste it into `.env` as `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`

> The webhook URL contains a secret token — treat it like a password. Never commit `.env` to git.

---

## Setting Up Gmail for Email Alerts

Gmail requires an **App Password** (not your regular password) when SMTP authentication is used from a third-party app.

### Step 1 — Enable 2-Factor Authentication

Go to [myaccount.google.com/security](https://myaccount.google.com/security) and turn on 2-Step Verification if it isn't already on. App Passwords are unavailable without it.

### Step 2 — Create an App Password

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Sign in if prompted
3. Under "Select app", choose **Mail** (or type a custom name)
4. Under "Select device", choose **Other** and type `Pokemon Monitor`
5. Click **Generate**
6. Copy the 16-character password shown (spaces don't matter)

### Step 3 — Add to `.env`

```env
EMAIL_ENABLED=true
EMAIL_FROM=you@gmail.com
EMAIL_TO=you@gmail.com          # can be a different address
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop   # the 16-char app password
```

### Step 4 — Test it

```bash
node notifier.js --test --channel email
```

---

## GitHub Actions Setup

Running on GitHub Actions means the monitor checks retailers every 15 minutes for free, even when your computer is off.

### Step 1 — Fork the repository

Click **Fork** on the GitHub repository page, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/pokemon-restock-monitor.git
cd pokemon-restock-monitor
```

### Step 2 — Enable Actions on your fork

Go to your fork's **Actions** tab and click **"I understand my workflows, go ahead and enable them"** if prompted.

### Step 3 — Add Secrets

Go to your fork → **Settings** → **Secrets and variables** → **Actions** → **Secrets** tab.

Click **New repository secret** for each of the following:

| Secret name | Required | Description |
|-------------|----------|-------------|
| `DISCORD_WEBHOOK_URL` | Yes (for Discord) | Webhook URL from the Discord setup above |
| `BESTBUY_API_KEY` | Yes (for Best Buy) | Free key from [developer.bestbuy.com](https://developer.bestbuy.com) |
| `EMAIL_ENABLED` | No | Set to `true` to enable email |
| `EMAIL_FROM` | No | Sender Gmail address |
| `EMAIL_TO` | No | Recipient address |
| `SMTP_HOST` | No | `smtp.gmail.com` |
| `SMTP_PORT` | No | `587` |
| `SMTP_SECURE` | No | `false` |
| `SMTP_USER` | No | Your Gmail address |
| `SMTP_PASS` | No | 16-char App Password |

### Step 4 — Add Variables

Go to the same **Secrets and variables** page → **Variables** tab.

Click **New repository variable** for optional overrides:

| Variable name | Default | Description |
|---------------|---------|-------------|
| `NOTIFY_CHANNELS` | `discord` | `discord`, `email`, or `discord,email` |
| `TARGET_ENABLED` | `true` | Set to `false` to disable Target |
| `WALMART_ENABLED` | `true` | Set to `false` to disable Walmart |
| `BESTBUY_ENABLED` | `true` | Set to `false` to disable Best Buy |
| `SEARCH_KEYWORDS` | *(see config.js)* | Comma-separated search terms |
| `FILTER_KEYWORDS` | *(see config.js)* | Notify only if name matches one of these |
| `MAX_PAGES` | `3` | Pages to fetch per retailer per run |

### Step 5 — Run initialization

Go to your fork's **Actions** tab → **Pokemon TCG Restock Monitor** → **Run workflow**.

Check the **Force initialization** box and click **Run workflow**. This baselines the current inventory so the first real run only alerts on changes.

### Step 6 — Verify it works

After the init run succeeds, trigger another manual run (without checking any boxes). Check Discord for any notification, or look at the run's summary for the counts of products checked.

From this point the schedule runs automatically every 15 minutes.

---

## Run Modes

### Normal run (cron)

```bash
node monitor.js
```

Runs once immediately, then repeats every 15 minutes. Ctrl-C to stop.

### One-shot (CI / manual)

```bash
node monitor.js --once
```

Runs once and exits. Used internally by the GitHub Actions workflow.

### Dry-run / test mode

```bash
node monitor.js --once --test
```

Full scrape and comparison. Logs everything it would notify but sends nothing and writes no state. Safe to run anytime.

### Force initialization

```bash
node monitor.js --once --init
```

Re-baselines all retailers from scratch. Use this after a long gap where many products changed, to avoid a flood of false "new" alerts.

### Test notifications

```bash
# Test all configured channels
node notifier.js --test

# Test only Discord
node notifier.js --test --channel discord

# Test only email
node notifier.js --test --channel email

# Check channel configuration status
node notifier.js
```

---

## Configuration Reference

All options are set via environment variables (`.env` locally, Secrets/Variables in GitHub Actions).

### Notification channels

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFY_CHANNELS` | `discord,email` | Which channels to use. Comma-separated: `discord`, `email`, or both |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook URL |
| `EMAIL_ENABLED` | `false` | Must be `true` to send emails |
| `EMAIL_FROM` | — | Sender address |
| `EMAIL_TO` | — | Recipient address |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for port 465 (SSL), `false` for STARTTLS |
| `SMTP_USER` | — | SMTP username (usually your email) |
| `SMTP_PASS` | — | SMTP password or App Password |

### Retailers

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_ENABLED` | `true` | Enable Target scraping |
| `WALMART_ENABLED` | `true` | Enable Walmart scraping |
| `BESTBUY_ENABLED` | `true` | Enable Best Buy scraping |
| `BESTBUY_API_KEY` | — | Best Buy Products API key (free) |

### Search and filtering

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_KEYWORDS` | `pokemon trading card game, pokemon tcg booster, pokemon elite trainer box` | Terms used to search each retailer. Comma-separated. |
| `FILTER_KEYWORDS` | `booster,elite trainer,etb,tin,collection,bundle,box,pack` | Product name must contain at least one of these to trigger a notification. Leave blank to notify on all results. |
| `MAX_PAGES` | `3` | How many result pages to fetch per retailer per run |

### Schedule

The check interval is hardcoded in `config.js` as `*/15 * * * *` (every 15 minutes). To change it, edit `config.checkInterval` and update the cron expression in `.github/workflows/monitor.yml`.

---

## Troubleshooting

### "No products found" for a retailer

- **Target / Walmart**: Their websites use bot-detection. The scrapers use residential-browser headers but can still be blocked intermittently. Retry a few minutes later.
- **Best Buy**: Without `BESTBUY_API_KEY` set, Best Buy falls back to HTML scraping which Akamai Bot Manager frequently blocks. Register for a free key at [developer.bestbuy.com](https://developer.bestbuy.com).

### Discord notifications not arriving

1. Run `node notifier.js` to check channel status — the output shows whether Discord is `🟢 ready` or `🔴 missing credentials`.
2. Verify `DISCORD_WEBHOOK_URL` is set correctly in `.env`.
3. Run `node notifier.js --test --channel discord` to send a test message.
4. Check that the webhook hasn't been deleted in Discord (Server Settings → Integrations → Webhooks).

### Email not sending

1. Confirm `EMAIL_ENABLED=true` in `.env`.
2. Make sure `SMTP_PASS` is the 16-character App Password, not your Google account password.
3. Verify 2-Factor Authentication is enabled on the Gmail account (required for App Passwords).
4. Run `node notifier.js --test --channel email` — the error message will be specific (EAUTH = wrong credentials, ECONNREFUSED = wrong host/port).

### GitHub Actions: "push failed" or workflow doesn't commit

- The `GITHUB_TOKEN` secret is automatically available — you don't need to create it. Ensure `permissions: contents: write` is present in the workflow (it is by default in this repo).
- If your repo requires signed commits or branch protection, you may need to relax those rules for the `github-actions[bot]` user.

### GitHub Actions: workflow doesn't trigger every 15 minutes

GitHub's cron scheduler for Actions can have delays of up to 15–30 minutes on free accounts, and may pause entirely if the repository has had no activity for 60 days. To re-enable a paused schedule, push any commit or trigger a manual run.

### "MSRP gate blocked" — product not alerting

The MSRP gate rejects products priced more than 20% above Pokemon Center's listed price. This is intentional — it catches scalper listings. If you want to see all products regardless of markup, set `FILTER_KEYWORDS` to a very broad term or comment out the MSRP check in `stateManager.js` (`MSRP_MAX_RATIO`).

### Too many notifications / alert spam

1. Tighten `FILTER_KEYWORDS` — add more specific product terms.
2. Increase `MSRP_MAX_RATIO` only if you know prices are legitimately higher in your region.
3. If you changed keywords or filter config and want a fresh baseline: `node monitor.js --once --init`.

### State file is missing or corrupt

Delete `data/products.json` and run `node monitor.js --once --init` to regenerate. The monitor will treat the missing file as a first run and create a clean baseline automatically.

---

## Project Structure

```
pokemon-restock-monitor/
├── monitor.js          # Main orchestrator — phases, logging, CLI
├── config.js           # All configuration (reads from .env)
├── stateManager.js     # State load/save, change detection, MSRP gate
├── notifier.js         # Notification routing (Discord + email)
├── msrpChecker.js      # Fetches MSRP data from Pokemon Center
├── scrapers/
│   ├── target.js       # Target scraper
│   ├── walmart.js      # Walmart scraper
│   └── bestbuy.js      # Best Buy scraper (API + HTML fallback)
├── notifiers/
│   ├── discord.js      # Discord webhook sender
│   └── email.js        # Email sender (nodemailer)
├── data/
│   ├── products.json        # Persisted product state (auto-generated)
│   └── msrp-database.json  # MSRP cache (auto-generated)
├── .github/workflows/
│   └── monitor.yml     # GitHub Actions workflow
├── .env.example        # Template — copy to .env and fill in values
└── package.json
```

---

## License

MIT
