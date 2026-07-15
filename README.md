# FBP Hub

Website for **Fantasy Baseball Pantheon (FBP)**, a Yahoo Fantasy Sports
dynasty league — live at
[www.pantheonleagues.com](https://www.pantheonleagues.com). Static site
(vanilla HTML/CSS/JS, no build step), backed by
[fbp-trade-bot](../fbp-trade-bot)'s bot/API for anything that needs to write
data or check identity.

## What this is

24 static pages covering everything a manager needs: standings, rosters,
player search, trade portal, weekly auction, KAP (keeper contract
purchases), PAD, the keeper/prospect draft, WizBucks balances, and an admin
portal. All read from JSON files in `data/`; anything that writes data goes
through the backend API rather than editing those files directly from the
browser.

## How it talks to the backend

Two separate paths, for two separate purposes:

- **Reads/writes to the bot's API** go through a Cloudflare Worker
  (`fbp-auth.zpressley.workers.dev`, source in `docs/cloudflare_worker/`)
  that injects the bot's API key server-side, so it's never shipped to the
  browser. Only routes explicitly whitelisted in the Worker are reachable —
  see `docs/CLOUDFLARE_WORKER_REFERENCE.md`.
- **Discord OAuth login** (`login.html` → Discord → `callback.html` →
  `dashboard.html`) is handled by `js/auth.js`, using the same Cloudflare
  Worker for the token exchange. See `PHASE2_SETUP.md` for the full setup
  walkthrough and `CONFIG_TEMPLATE.md` for the config values.

## Data sync

`data/*.json` is a mirror of fbp-trade-bot's data, kept current by two
independent mechanisms:

1. fbp-trade-bot's `daily-update.yml` workflow pushes a short list of files
   (roster/contract/standings data) directly to this repo after its daily
   pipeline run.
2. This repo's own `.github/workflows/sync-data.yml` pulls a broader list of
   files from fbp-trade-bot every 15 minutes (or immediately via
   `repository_dispatch`), as a backup/catch-up sync.

Not every file in `data/` is covered by either mechanism — some (like
`keeper_pool_2026.json`, `league_baselines.json`) are generated in place
rather than mirrored from the bot repo, and a couple are intentional stubs
(see the comments in `sync-data.yml` before adding new files to its list —
a real data drift bug from an uncovered file was found and fixed here in
July 2026).

`CRITICAL_RULES.md` documents one important source-of-truth rule: WizBucks
balances come from `data/wizbucks.json`, never `managers.json`.

## Cache busting

JS/CSS references get a `?v=<timestamp>` query param stamped on automatically
by `.github/workflows/cache-bust.yml` on every push that touches HTML/JS/CSS
— see `docs/CACHE_BUSTING_STRATEGY.md`. No manual step needed.

## Deployment

Hosted via **GitHub Pages** with a custom domain (see `CNAME`). Pushing to
`main` deploys automatically.

## Where to look next

- `docs/` — feature-specific reference docs (team colors, player profiles,
  KAP/buy-in/WizBucks flows shared with fbp-trade-bot), and `docs/archive/`
  for superseded planning docs and old milestone snapshots.
- `docs/{Master} FBP Constitution 2026 (1).md` — the league rulebook,
  fetched live by `constitution.html` rather than duplicated inline.
- `WARP.md` — a more detailed structural walkthrough of the codebase.
- [`fbp-trade-bot`](../fbp-trade-bot) — the backend this site talks to.
