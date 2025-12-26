# FBP Hub - Configuration Template

## 🔧 Quick Configuration

Copy this template and fill in your values, then update the files as indicated.

---

## Discord OAuth Application

**Created at:** https://discord.com/developers/applications

```
Application Name: FBP Hub
Client ID: YOUR_DISCORD_CLIENT_ID_HERE
Client Secret: YOUR_DISCORD_CLIENT_SECRET_HERE (keep secret!)

Redirect URIs:
https://yourusername.github.io/fbp-hub/callback.html
```

---

## Cloudflare Worker

**Created at:** https://dash.cloudflare.com

```
Worker Name: fbp-auth
Worker URL: https://fbp-auth.your-subdomain.workers.dev

Environment Variables (Secrets):
DISCORD_CLIENT_ID_ENV = YOUR_DISCORD_CLIENT_ID_HERE
DISCORD_CLIENT_SECRET_ENV = YOUR_DISCORD_CLIENT_SECRET_HERE
REDIRECT_URI_ENV = https://yourusername.github.io/fbp-hub/callback.html
```

---

## File Updates Required

### 1. Update js/auth.js

Find this section and update:

```javascript
const AUTH_CONFIG = {
    clientId: 'YOUR_DISCORD_CLIENT_ID_HERE',
    workerUrl: 'https://fbp-auth.your-subdomain.workers.dev',
    redirectUri: 'https://yourusername.github.io/fbp-hub/callback.html',
    scopes: ['identify', 'guilds'],
    sessionDuration: 7 * 24 * 60 * 60 * 1000
};
```

### 2. Verify js/auth.js Manager Mapping

Ensure Discord IDs are correct:

```javascript
const MANAGER_MAPPING = {
    '347571660230230017': 'HAM',
    '689911142432112657': 'RV',
    '689952988957245578': 'B2J',
    '689887002887454815': 'CFL',
    '892152416718422056': 'LAW',
    '890059214586773574': 'LFB',
    '814294382529347594': 'JEP',
    '161932197308137473': 'TBB',
    '161967242118955008': 'WIZ',
    '541092942455242754': 'DRO',
    '875750135005597728': 'SAD',
    '664280448788201522': 'WAR'
};
```

**How to get Discord IDs:**
1. Enable Developer Mode: Discord Settings → Advanced → Developer Mode
2. Right-click user → "Copy User ID"

### 3. Set Commissioner (js/auth.js)

```javascript
const COMMISSIONER_IDS = [
    '161967242118955008'  // Your Discord ID here
];
```

---

## Security Checklist

- [ ] Discord Client Secret is ONLY in Cloudflare (never in code)
- [ ] Environment variables set in Cloudflare dashboard
- [ ] Redirect URI matches exactly in Discord app
- [ ] CORS configured in Worker (production: use specific origin, not *)
- [ ] GitHub repository is public (required for free Pages)

---

## Testing Checklist

- [ ] Local test: `python3 -m http.server 8000`
- [ ] Login flow works: /login.html → Discord → /callback.html → /dashboard.html
- [ ] Dashboard shows correct team
- [ ] Session persists after browser close
- [ ] Logout clears session
- [ ] Worker health check: visit `https://your-worker.workers.dev/health`

---

## Production URLs

**Replace these placeholders throughout:**

- `yourusername` → Your GitHub username
- `YOUR_DISCORD_CLIENT_ID` → From Discord Developer Portal
- `YOUR_DISCORD_CLIENT_SECRET` → From Discord Developer Portal (Cloudflare only!)
- `fbp-auth.your-subdomain.workers.dev` → Your Cloudflare Worker URL

---

## Cost Breakdown (Spoiler: $0)

| Service | Tier | Cost |
|---------|------|------|
| GitHub Pages | Public repo | **$0/month** |
| Cloudflare Workers | 100k requests/day | **$0/month** |
| Discord OAuth | Unlimited | **$0/month** |
| **Total** | | **$0/month** |

---

## Quick Start Commands

```bash
# 1. Add Phase 2 files to your repo
cp -r phase2-files/* fbp-hub/

# 2. Update configuration (edit js/auth.js)
# Use values from this file

# 3. Test locally
cd fbp-hub
python3 -m http.server 8000

# 4. Deploy
git add .
git commit -m "Phase 2: Discord OAuth authentication"
git push origin main

# 5. Test production
# Visit https://yourusername.github.io/fbp-hub/login.html
```

---

## Need Help?

1. Check PHASE2_SETUP.md troubleshooting section
2. Verify all URLs match exactly
3. Check browser console (F12) for errors
4. Check Cloudflare Worker logs
5. Ensure environment variables are set correctly

**Save this file for reference!** 📋
