# Cloudflare Worker Reference (fbp-auth)
This repository is a static site. The dynamic APIs (draft, PAD, admin tools, manager self-service) are proxied through a Cloudflare Worker deployed separately.

This doc exists to keep a copy of the Worker routing logic under version control for auditing and future edits.

## Deployment
Deployed separately in Cloudflare Workers (not executed from this repo).

Known deployment URL:
- `https://fbp-auth.zpressley.workers.dev`

## Source snapshot
The Worker source snapshot is stored here:
- `docs/cloudflare_worker/worker.js`

## Environment variables (Cloudflare)
Required secrets/vars:
- `BOT_API_URL` – base URL of the Render FastAPI service (the bot)
- `BOT_API_KEY` – shared secret forwarded as `X-API-Key`
- `DISCORD_CLIENT_ID_ENV`
- `DISCORD_CLIENT_SECRET_ENV`
- `REDIRECT_URI_ENV` (or `REDIRECT_URL_ENV`)

## Routes (high level)
- Draft: `/api/draft/*`
- Buy-In: 
  - `POST /api/buyin/purchase` - Purchase keeper draft buy-in
  - `POST /api/buyin/refund` - Refund keeper draft buy-in (admin only)
- PAD: `POST /api/pad/submit`
- Auction: `/api/auction/*`
- Manager self-service:
  - `POST /api/manager/contract-purchase`
- Admin:
  - `/api/admin/*`
- Auth:
  - `POST /token`
  - `GET /user`

## Notes
- The Worker proxies requests to the bot with `X-API-Key`.
- Authentication/authorization rules (manager vs admin gating) should be enforced in the Worker where applicable.
