# Phase 2: Free Discord OAuth Authentication Setup

## 🎯 What You'll Get

- **Discord OAuth Login** - One-click sign in
- **Manager Dashboards** - Personalized for each team
- **Team Identification** - Automatic based on Discord ID
- **Session Management** - 7-day persistent sessions
- **100% Free** - Cloudflare Workers free tier (100k requests/day)

---

## 📋 Prerequisites

- Phase 1 deployed and working
- Discord account (you already have this!)
- Cloudflare account (free - we'll create this)
- 15 minutes for setup

---

## Step 1: Create Discord OAuth Application

### 1.1 Go to Discord Developer Portal

Visit: https://discord.com/developers/applications

### 1.2 Create New Application

1. Click "New Application"
2. Name: `FBP Hub` (or your preferred name)
3. Click "Create"

### 1.3 Get Your Client ID

1. Go to "OAuth2" → "General"
2. Copy your **Client ID**
3. Save it - you'll need this later

### 1.4 Get Your Client Secret

1. Still in "OAuth2" → "General"
2. Click "Reset Secret" (or view if first time)
3. Copy your **Client Secret**
4. ⚠️ **IMPORTANT**: Keep this secret! Never commit to GitHub

### 1.5 Add Redirect URI

1. Still in "OAuth2" → "General"
2. Click "Add Redirect"
3. Enter: `https://yourusername.github.io/fbp-hub/callback.html`
   - Replace `yourusername` with your GitHub username
4. Click "Save Changes"

### 1.6 Configure Scopes (Optional)

1. Go to "OAuth2" → "URL Generator"
2. Select scopes:
   - ✅ `identify` (required - gets username/avatar)
   - ✅ `guilds` (optional - shows Discord servers)
3. This is just for testing - actual scopes are in the code

---

## Step 2: Set Up Cloudflare Workers (Free)

### 2.1 Create Cloudflare Account

1. Go to: https://dash.cloudflare.com/sign-up
2. Sign up with email (free tier)
3. Verify email
4. Skip domain setup (not needed)

### 2.2 Create a Worker

1. Go to "Workers & Pages" in left sidebar
2. Click "Create Application"
3. Click "Create Worker"
4. Name it: `fbp-auth` (or your preferred name)
5. Click "Deploy"

### 2.3 Add Worker Code

1. Click "Edit Code" button
2. Delete the default code
3. Copy entire contents of `cloudflare-worker/worker.js`
4. Paste into editor
5. **Don't save yet** - we need to add secrets first

### 2.4 Add Environment Variables (Secrets)

1. Click "Settings" tab
2. Scroll to "Environment Variables"
3. Click "Add Variable"
4. Add these three variables:

   **Variable 1:**
   - Name: `DISCORD_CLIENT_ID_ENV`
   - Value: Your Discord Client ID from Step 1.3
   - ✅ Encrypt

   **Variable 2:**
   - Name: `DISCORD_CLIENT_SECRET_ENV`
   - Value: Your Discord Client Secret from Step 1.4
   - ✅ Encrypt

   **Variable 3:**
   - Name: `REDIRECT_URI_ENV`
   - Value: `https://yourusername.github.io/fbp-hub/callback.html`
   - ✅ Encrypt

5. Click "Save and Deploy"

### 2.5 Get Your Worker URL

1. Go back to "Workers & Pages"
2. Click on your `fbp-auth` worker
3. Copy the worker URL (looks like: `fbp-auth.your-subdomain.workers.dev`)
4. Save this - you'll need it next

---

## Step 3: Update Your FBP Hub Code

### 3.1 Update auth.js Configuration

Open `js/auth.js` and update these values:

```javascript
const AUTH_CONFIG = {
    // Your Discord Client ID from Step 1.3
    clientId: 'YOUR_DISCORD_CLIENT_ID_HERE',
    
    // Your Cloudflare Worker URL from Step 2.5
    workerUrl: 'https://fbp-auth.your-subdomain.workers.dev',
    
    // Your GitHub Pages URL + callback
    redirectUri: 'https://yourusername.github.io/fbp-hub/callback.html',
    
    scopes: ['identify', 'guilds'],
    sessionDuration: 7 * 24 * 60 * 60 * 1000
};
```

### 3.2 Update Manager Mapping

In `js/auth.js`, verify the `MANAGER_MAPPING` has correct Discord IDs:

```javascript
const MANAGER_MAPPING = {
    '347571660230230017': 'HAM',  // Update with real Discord IDs
    '689911142432112657': 'RV',
    // ... rest of teams
};
```

**How to get Discord IDs:**
1. Enable Developer Mode in Discord: Settings → Advanced → Developer Mode
2. Right-click a user → "Copy User ID"

### 3.3 Add New Files to Your Repository

Copy these Phase 2 files to your fbp-hub repository:

```bash
# Authentication pages
login.html
callback.html
dashboard.html

# Authentication CSS
css/auth.css
css/dashboard.css

# Authentication JavaScript
js/auth.js
js/login.js
js/callback.js
js/dashboard.js
```

---

## Step 4: Deploy Phase 2

### 4.1 Test Locally First

```bash
cd fbp-hub
python3 -m http.server 8000

# Visit http://localhost:8000/login.html
# Click "Continue with Discord"
# Should redirect to Discord OAuth
```

### 4.2 Commit and Push

```bash
git add .
git commit -m "Phase 2: Add Discord OAuth authentication

- Add login page with Discord OAuth
- Add OAuth callback handler
- Add manager dashboard
- Add Cloudflare Worker for free backend
- Add session management with 7-day persistence
- Add team identification from Discord ID"

git push origin main
```

### 4.3 Wait for GitHub Pages Deploy

1. Go to your repository → Actions tab
2. Wait for deployment to complete (~2 minutes)
3. Visit: `https://yourusername.github.io/fbp-hub/login.html`

---

## Step 5: Test Authentication

### 5.1 Test Login Flow

1. Visit `/login.html`
2. Click "Continue with Discord"
3. Authorize the FBP Hub app
4. Should redirect to `/callback.html`
5. Should process and redirect to `/dashboard.html`
6. Dashboard should show your team info

### 5.2 Test Session Persistence

1. Close browser
2. Open and visit `/dashboard.html` directly
3. Should still be logged in (no redirect to login)

### 5.3 Test Logout

1. Click your avatar in nav
2. Click "Logout"
3. Should redirect to `/login.html`
4. Session should be cleared

---

## 🎨 Customization

### Update Team Names

In `js/auth.js`:

```javascript
const TEAM_NAMES = {
    'WIZ': 'Your Team Name',
    // Update these
};
```

### Add Commissioner

In `js/auth.js`:

```javascript
const COMMISSIONER_IDS = [
    'YOUR_DISCORD_ID_HERE'
];
```

### Change Session Duration

In `js/auth.js`:

```javascript
sessionDuration: 14 * 24 * 60 * 60 * 1000  // 14 days instead of 7
```

---

## 🔒 Security Notes

### Production Security Checklist

1. **Update CORS in Worker:**
   ```javascript
   'Access-Control-Allow-Origin': 'https://yourusername.github.io'
   ```
   Replace `*` with your actual GitHub Pages URL

2. **Never Commit Secrets:**
   - Discord Client Secret
   - Cloudflare Worker environment variables
   - Keep these in Cloudflare dashboard only

3. **Use HTTPS Only:**
   - GitHub Pages uses HTTPS automatically
   - Never test OAuth with http:// in production

### What Data We Store

- **localStorage**: Session token, user ID, username, avatar
- **No database**: Everything is client-side
- **No user tracking**: We don't log or track anything
- **Discord OAuth**: Only requests `identify` scope

---

## 🐛 Troubleshooting

### "Invalid Redirect URI" Error

**Problem**: Discord shows this error during OAuth

**Solution**:
1. Check Discord Developer Portal → OAuth2 → Redirects
2. Ensure exact match: `https://yourusername.github.io/fbp-hub/callback.html`
3. No trailing slash!
4. Must be HTTPS (not http)

### "Authentication Failed" on Callback

**Problem**: Callback page shows error

**Solutions**:
1. **Check Worker URL**: Verify `workerUrl` in `auth.js` matches Cloudflare worker
2. **Check Secrets**: Verify environment variables in Cloudflare dashboard
3. **Check Console**: Open browser DevTools (F12) for error details
4. **Test Worker**: Visit `https://your-worker.workers.dev/health` - should return `{"status":"ok"}`

### Dashboard Shows "Loading..." Forever

**Problem**: Dashboard doesn't load team data

**Solutions**:
1. **Check Data Files**: Ensure `combined_players.json`, `standings.json`, `wizbucks.json` exist
2. **Check Discord ID**: Verify your Discord ID is in `MANAGER_MAPPING`
3. **Check Console**: Look for JavaScript errors
4. **Try Logout/Login**: Clear session and re-authenticate

### Worker Not Responding

**Problem**: OAuth callback fails with network error

**Solutions**:
1. **Check Worker Status**: Go to Cloudflare dashboard → Workers → your worker
2. **Check Logs**: Click on worker → "Logs" tab for errors
3. **Re-deploy**: Sometimes needs a fresh deploy
4. **Verify Secrets**: Re-check environment variables

### Session Expired Too Fast

**Problem**: Getting logged out after browser close

**Solution**:
- Check `sessionDuration` in `auth.js`
- Ensure `expiresAt` is calculated correctly
- Check localStorage isn't being cleared by browser

---

## 📊 Free Tier Limits

### Cloudflare Workers

- **Requests**: 100,000/day
- **CPU Time**: 10ms per request
- **Storage**: 1GB (not used)
- **Cost**: $0/month

**For FBP (12 managers):**
- ~100-200 requests/day typical
- Well within free tier
- No scaling needed

### GitHub Pages

- **Bandwidth**: 100GB/month
- **Build Minutes**: Unlimited for public repos
- **Storage**: 1GB
- **Cost**: $0/month

---

## ✅ Success Checklist

Phase 2 is complete when:

- [ ] Discord OAuth app created
- [ ] Cloudflare Worker deployed with secrets
- [ ] Code updated with correct IDs/URLs
- [ ] All files committed to GitHub
- [ ] GitHub Pages deployed successfully
- [ ] Login flow works end-to-end
- [ ] Dashboard loads with team data
- [ ] Session persists across browser restarts
- [ ] Logout clears session properly
- [ ] All 12 managers' Discord IDs mapped

---

## 🚀 What's Next?

**Phase 3 Options:**

1. **WizBucks Management** - Track installments, transactions
2. **Self-Service Transactions** - Prospect graduations, DC slots
3. **Service Time Tracker** - Progress bars for prospects
4. **Transaction History** - League-wide trade log

Which would you like to build next?

---

## 💡 Tips

- **Test with multiple Discord accounts** to verify team mapping
- **Use browser incognito** to test fresh sessions
- **Keep DevTools open** (F12) to catch errors early
- **Save your Client Secret** somewhere safe (password manager)
- **Document your Worker URL** for future reference

---

## 📞 Support

If stuck:
1. Check browser console (F12) for errors
2. Check Cloudflare Worker logs
3. Verify all URLs match exactly
4. Try the troubleshooting section above
5. Open an issue on GitHub

**You now have free Discord authentication! 🎉**
