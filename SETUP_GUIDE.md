# Setup Guide — Pokemon TCG Restock Monitor

This guide walks you through setting up the monitor step by step, from zero to receiving your first Discord or email alert. No prior coding experience required.

---

## What You'll End Up With

Every 15 minutes, GitHub's servers will automatically check Target, Walmart, and Best Buy for Pokemon TCG products. When something new appears — or an out-of-stock item comes back — you'll get an alert like this:

**Discord alert example:**
```
🃏 Pokemon TCG Monitor
━━━━━━━━━━━━━━━━━━━━━
[NEW]  Pokemon TCG: Prismatic Evolutions ETB
       $49.99  (MSRP $49.99 — at MSRP ✅)
       🏪 Target
       [Shop Now →]

[RESTOCK]  Pokemon TCG: 151 Booster Pack
           $4.49  (MSRP $4.99 — 10% below ✅)
           🏪 Walmart  ·  Previously: out of stock
           [Shop Now →]
```

It's entirely free and runs 24/7 without your computer being on.

---

## Overview: What You'll Do

1. Get the code onto your computer (10 min)
2. Get a Discord webhook URL (5 min)
3. Set up your configuration file (5 min)
4. Upload the code to GitHub (10 min)
5. Add your credentials to GitHub (10 min)
6. Run the initialization step (2 min)
7. Confirm alerts are working (2 min)

Total time: about 45 minutes on the first setup.

---

## Part 1 — Install the Required Software

Skip any step you've already done.

### Install Node.js

Node.js is the engine that runs the monitor.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the big green **LTS** button (not "Current")
3. Run the installer — click through all the defaults

**Verify it worked:** Open Terminal (Mac) or Command Prompt (Windows) and type:
```
node --version
```
You should see something like `v20.11.0`. Any number 18 or higher is fine.

### Install Git

Git is used to upload the code to GitHub.

1. Go to **[git-scm.com/downloads](https://git-scm.com/downloads)**
2. Download the installer for your operating system
3. Run it — click through all the defaults

**Verify it worked:** In Terminal/Command Prompt:
```
git --version
```
You should see something like `git version 2.44.0`.

---

## Part 2 — Get the Code

### Create a GitHub account

If you don't have one:

1. Go to **[github.com](https://github.com)**
2. Click **Sign up** and follow the steps

### Fork the repository

"Forking" makes your own copy of the project where you can add your credentials.

1. Go to the project's GitHub page
2. Click the **Fork** button in the top-right corner

   ```
   [⭐ Star]  [🍴 Fork ▾]
   ```

3. On the fork page, keep all defaults and click **Create fork**
4. You now have your own copy at `github.com/YOUR_USERNAME/pokemon-restock-monitor`

### Download your fork to your computer

1. On your fork's page, click the green **Code** button
2. Click **HTTPS** and copy the URL shown
3. Open Terminal (Mac) or Command Prompt (Windows)
4. Type the following, replacing the URL with yours:
   ```
   git clone https://github.com/YOUR_USERNAME/pokemon-restock-monitor.git
   ```
5. Press Enter — the files will download
6. Move into the project folder:
   ```
   cd pokemon-restock-monitor
   ```

### Install the project's dependencies

In the same Terminal window:
```
npm install
```

You'll see a lot of text scroll by. Wait until you get your prompt back. This only needs to be done once.

---

## Part 3 — Get Your Discord Webhook URL

A webhook URL is a special address that lets the monitor post messages to a Discord channel.

### Step 1 — Go to your Discord server

Open Discord and navigate to the server where you want alerts to appear. If you don't have a server just for this, you can create one: click the **+** button in the server list on the left.

### Step 2 — Open channel settings

Right-click on the text channel you want alerts posted to (e.g. `#pokemon-alerts`), then click **Edit Channel**.

```
 # pokemon-alerts
   Edit Channel   ←── click this
   Invite People
   ...
```

### Step 3 — Go to Integrations

In the channel settings sidebar, click **Integrations**.

```
Overview
Permissions
Invites
Bans
► Integrations   ←── click this
```

### Step 4 — Create a webhook

1. Click **Webhooks**
2. Click **New Webhook**
3. Click on the new webhook to expand it
4. Give it a name: `Pokemon TCG Monitor`
5. Optionally, upload an avatar (any Pokeball image works)
6. Click **Copy Webhook URL** — this copies a long URL to your clipboard

   ```
   https://discord.com/api/webhooks/1234567890123456789/abcdefg...
   ```

7. Click **Save Changes**

**Keep this URL safe** — anyone with it can post to your channel.

---

## Part 4 — (Optional) Set Up Gmail Email Alerts

Skip this section if you only want Discord alerts.

Gmail uses "App Passwords" — separate passwords for apps — instead of your main password. This keeps your account secure.

### Step 1 — Turn on 2-Step Verification

1. Go to **[myaccount.google.com/security](https://myaccount.google.com/security)**
2. Find **2-Step Verification** and turn it on if it's off
3. Follow the prompts to set it up (you'll use your phone to confirm)

   > If 2-Step Verification is already on, skip to Step 2.

### Step 2 — Create an App Password

1. Go to **[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)**
2. You may need to sign in again
3. In the **App name** box, type: `Pokemon Monitor`
4. Click **Create**
5. A box will appear with a 16-character password like: `abcd efgh ijkl mnop`
6. **Copy this password** — Google will only show it once

---

## Part 5 — Configure the Monitor

### Step 1 — Create your configuration file

In Terminal, make sure you're still in the `pokemon-restock-monitor` folder, then run:

**Mac/Linux:**
```
cp .env.example .env
```

**Windows:**
```
copy .env.example .env
```

### Step 2 — Edit the file

Open `.env` in any text editor (Notepad on Windows, TextEdit on Mac, or VS Code if you have it).

You'll see something like this:
```
NOTIFY_CHANNELS=discord,email
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
...
```

**Minimum required — Discord only:**

Replace the placeholder webhook URL with your real one:
```
NOTIFY_CHANNELS=discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890/your-actual-token-here
```

**If you also want email:**

```
NOTIFY_CHANNELS=discord,email
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

EMAIL_ENABLED=true
EMAIL_FROM=your.gmail@gmail.com
EMAIL_TO=your.gmail@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.gmail@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

Save the file.

### Step 3 — Test your Discord connection

In Terminal:
```
node notifier.js --test --channel discord
```

Check your Discord channel — a test message with three mock products should appear within a few seconds. If it does, Discord is working.

If you set up email:
```
node notifier.js --test --channel email
```

Check your inbox (and spam folder).

---

## Part 6 — (Optional) Get a Best Buy API Key

Without an API key, the monitor tries to scrape Best Buy's website directly, which is often blocked. A free API key unlocks the reliable Products API.

1. Go to **[developer.bestbuy.com](https://developer.bestbuy.com)**
2. Click **Sign Up**
3. Fill in the form and verify your email
4. After logging in, your API key is shown on the dashboard
5. Copy the key and add it to `.env`:
   ```
   BESTBUY_API_KEY=your-key-here
   ```

---

## Part 7 — Upload to GitHub and Add Credentials

Credentials go into GitHub Secrets — an encrypted store that only your workflow can access. They're never visible in the code.

### Step 1 — Push your code to GitHub

In Terminal (inside the project folder):

```
git add .
git commit -m "Initial setup"
git push
```

If this is your first time using git, you may be prompted to log in to GitHub. Follow the prompts.

### Step 2 — Open your repository settings

Go to `github.com/YOUR_USERNAME/pokemon-restock-monitor` → click **Settings** (the gear icon, far right of the tab bar).

```
< > Code   Issues   Pull requests   Actions   ⚙ Settings
```

### Step 3 — Go to Secrets

In the Settings sidebar:

```
General
Access
  Collaborators
Code and automation
  Branches
  ▶ Secrets and variables   ←── click this
    Actions
  ...
```

Click **Secrets and variables** → **Actions**.

You'll see two tabs: **Secrets** and **Variables**.

### Step 4 — Add Secrets

On the **Secrets** tab, click **New repository secret** for each value below.

> The **Name** must be typed exactly as shown — it's case-sensitive.

**Required:**

| Name | Value |
|------|-------|
| `DISCORD_WEBHOOK_URL` | Your Discord webhook URL |

**Required for Best Buy:**

| Name | Value |
|------|-------|
| `BESTBUY_API_KEY` | Your Best Buy API key |

**Required only if using email:**

| Name | Value |
|------|-------|
| `EMAIL_ENABLED` | `true` |
| `EMAIL_FROM` | `your.gmail@gmail.com` |
| `EMAIL_TO` | `your.gmail@gmail.com` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `your.gmail@gmail.com` |
| `SMTP_PASS` | The 16-character App Password |

### Step 5 — Add Variables

Click the **Variables** tab, then **New repository variable** for optional settings.

| Name | Value | Purpose |
|------|-------|---------|
| `NOTIFY_CHANNELS` | `discord` or `discord,email` | Which channels to use |
| `TARGET_ENABLED` | `true` or `false` | Toggle Target |
| `WALMART_ENABLED` | `true` or `false` | Toggle Walmart |
| `BESTBUY_ENABLED` | `true` or `false` | Toggle Best Buy |

---

## Part 8 — Enable GitHub Actions

### Step 1 — Go to the Actions tab

On your repository page, click the **Actions** tab.

```
< > Code   Issues   Pull requests   ⚡ Actions   Settings
```

### Step 2 — Enable workflows (first time only)

If you see a banner that says "Workflows aren't being run on this forked repository", click the **"I understand my workflows, go ahead and enable them"** button.

### Step 3 — Run initialization

The first run must be done manually to baseline the current inventory. Without this step, the monitor will treat every existing product as "new" and flood your alerts.

1. Click **Pokemon TCG Restock Monitor** in the left sidebar
2. Click **Run workflow** (the dropdown button on the right)
3. A form will appear:
   ```
   [✅] Force initialization (re-baseline all products without notifying)
   [ ] Dry run (scrape + compare, skip notifications and state write)
   ```
4. Check the **Force initialization** box
5. Click the green **Run workflow** button

The workflow will appear in the list. Click on it to watch progress. The run takes 2–5 minutes.

When it finishes with a green checkmark (✅), the baseline is set.

### Step 4 — Verify with a test run

1. Click **Run workflow** again — this time leave both boxes unchecked
2. Click **Run workflow**
3. Wait for it to finish

Check the **Summary** tab of the finished run — it shows how many products were checked and how many changes were found. No Discord message means no products changed since the last run (that's expected).

From this point the workflow runs automatically every 15 minutes. You don't need to do anything else.

---

## Part 9 — Checking That It Works

### See recent runs

Go to **Actions** → **Pokemon TCG Restock Monitor**. Each row is one run — green checkmark = success, red X = failure.

### Read the run summary

Click any completed run → scroll to the bottom to see the **Summary** box with the trigger, mode, and job status.

### Force a full re-scan

If you want to check right now without waiting for the schedule:

1. **Actions** → **Pokemon TCG Restock Monitor** → **Run workflow**
2. Leave boxes unchecked → **Run workflow**

### Check the state file

After a successful run, `data/products.json` in your repository will be updated with the latest snapshot. You can view it on GitHub by clicking on `data/` → `products.json`.

---

## Adjusting What You're Notified About

### Change which products trigger alerts

Edit the `FILTER_KEYWORDS` repository variable (Settings → Secrets and variables → Variables).

Default: `booster,elite trainer,etb,tin,collection,bundle,box,pack`

This means: only alert if the product name contains at least one of these words. Add or remove terms as you like. To alert on everything, delete the variable (or set it to a blank value).

### Change what's searched for

Edit the `SEARCH_KEYWORDS` variable.

Default: `pokemon trading card game,pokemon tcg booster,pokemon elite trainer box`

These are the terms submitted to each retailer's search. If you want to narrow (e.g. just ETBs) or broaden the search, update this.

### Disable a retailer

Set `TARGET_ENABLED`, `WALMART_ENABLED`, or `BESTBUY_ENABLED` to `false` in Variables.

### Re-baseline after changing keywords

After changing `SEARCH_KEYWORDS` or `FILTER_KEYWORDS`, run initialization again so the new product set becomes the baseline:

**Actions** → **Run workflow** → check **Force initialization** → **Run workflow**

---

## Common Problems

### "I ran init but got no products"

The scraper couldn't reach the retailer (bot detection, timeout, etc). This is normal and intermittent. Wait a few minutes and run initialization again. Best Buy without an API key is the most common cause — see Part 6 above.

### "I got a flood of alerts on the first real run"

The initialization didn't run (or failed silently). Run initialization again:

**Actions** → **Run workflow** → check **Force initialization** → **Run workflow**

### "The workflow shows a red X"

1. Click the failed run
2. Click **monitor** to expand the job
3. Find the red step and click it to read the error

Common causes:
- Typo in a secret name (check the exact spelling)
- Discord webhook was deleted (recreate it in Discord)
- Push failed due to a branch protection rule (check Settings → Branches)

### "I stopped getting alerts"

GitHub pauses scheduled workflows on repositories with no activity for 60 days. Push any commit (or trigger a manual run) to re-activate the schedule.

### "Discord messages appear but have no price"

The MSRP database fetch may have failed. This is cosmetic — the alert still fires. Check the run log for MSRP-related warnings.

### "I want to stop the monitor"

Go to **Actions** → **Pokemon TCG Restock Monitor** → click the three-dot menu (⋯) → **Disable workflow**. You can re-enable it the same way.

---

## Updating the Monitor

When the project is updated with bug fixes or new features:

1. In Terminal, inside the project folder:
   ```
   git pull upstream main
   git push
   ```
   (If this is a fresh fork, you may need to add the upstream first: `git remote add upstream https://github.com/ORIGINAL_OWNER/pokemon-restock-monitor.git`)

2. If `package.json` changed, run `npm install` again.

---

## Getting Help

- Read the full **README.md** for command reference and configuration details
- Check the **Actions** run logs for specific error messages — they're usually descriptive
- Open an issue on GitHub if something is consistently broken
