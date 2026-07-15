# Buy-In System Deployment Guide

This guide covers deploying the keeper draft pick buy-in system to production.

## Overview

The buy-in system allows managers to purchase keeper draft picks (Rounds 1-3) using their KAP allotment. The system is fully integrated with:
- Draft order tracking
- WizBucks transaction ledger
- KAP balance management
- Discord notifications

## Architecture

### Frontend (fbp-hub)
- `js/draft-picks.js` - Buy-in purchase/refund UI and API calls
- `draft-picks.html` - Draft picks page with buy-in buttons
- Navigation dropdown for Draft → Draft Order / Draft Preview / Draft Picks

### Backend (fbp-trade-bot)
- `api_buyin.py` - FastAPI endpoints for purchase/refund
- `health.py` - Router registration
- Updates 3 data files on each transaction:
  - `data/draft_order_2026.json`
  - `data/wizbucks_transactions.json`
  - `config/managers.json`

## Deployment Steps

### 1. Backend Setup (fbp-trade-bot)

#### Already Completed
- ✅ Created `api_buyin.py` with purchase/refund endpoints
- ✅ Updated `health.py` to include buyin router
- ✅ Backend posts to Discord channel 1089979265619083444
- ✅ Admin role check uses `"role": "admin"` from managers.json

#### Deployment Actions
1. **Push changes to fbp-trade-bot repo**:
   ```bash
   cd /Users/zpressley/fbp-trade-bot
   git add api_buyin.py health.py
   git commit -m "Add buy-in API endpoints for keeper draft picks"
   git push
   ```

2. **Verify BOT_API_KEY environment variable**:
   - Ensure `BOT_API_KEY` is set in Railway's environment variables
   - This is the authentication key for API requests

3. **Restart the bot service** to load new endpoints

4. **Test endpoints**:
   ```bash
   # Test purchase (replace with actual values)
   curl -X POST https://your-bot-api.com/api/buyin/purchase \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_BOT_API_KEY" \
     -d '{"team":"WIZ","round":1,"cost":55,"purchased_by":"WIZ"}'
   
   # Test refund (admin only)
   curl -X POST https://your-bot-api.com/api/buyin/refund \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_BOT_API_KEY" \
     -d '{"team":"WIZ","round":1,"admin_user":"WIZ"}'
   ```

### 2. Frontend Setup (fbp-hub)

#### Already Completed
- ✅ Updated `js/draft-picks.js` to call backend API
- ✅ Updated `js/main.js` with API key config
- ✅ Removed Discord webhook (handled by backend)
- ✅ Added navigation dropdown for Draft pages
- ✅ Admin check uses `role: "admin"` field

#### Deployment Actions
1. **Update API key in `js/main.js`**:
   ```javascript
   // Line 23 in js/main.js
   apiKey: 'YOUR_ACTUAL_BOT_API_KEY' // Must match BOT_API_KEY from backend
   ```

2. **Copy updated draft_order_2026.json** (if not already done):
   ```bash
   cp /Users/zpressley/fbp-trade-bot/data/draft_order_2026.json \
      /Users/zpressley/fbp-hub/data/draft_order_2026.json
   ```

3. **Push changes to fbp-hub repo**:
   ```bash
   cd /Users/zpressley/fbp-hub
   git add .
   git commit -m "Add buy-in system with backend integration and navigation dropdown"
   git push
   ```

4. **Deploy to GitHub Pages** (if auto-deploy is not enabled):
   - Changes should auto-deploy via GitHub Pages
   - Verify at your-username.github.io/fbp-hub

### 3. Cloudflare Worker (if needed)

If your Cloudflare Worker proxies requests to the bot API, ensure it forwards:
- `/api/buyin/purchase` → bot API
- `/api/buyin/refund` → bot API

The worker should preserve:
- `X-API-Key` header
- Request body
- POST method

### 4. Configuration Files

#### managers.json
Ensure each admin has the role field:
```json
{
  "teams": {
    "WIZ": {
      "name": "Whiz Kids",
      "role": "admin",
      ...
    }
  }
}
```

#### draft_order_2026.json
Keeper draft picks should have buy-in fields:
```json
{
  "draft": "keeper",
  "round": 1,
  "pick": 1,
  "team": "TBB",
  "original_owner": "TBB",
  "current_owner": "TBB",
  "traded": false,
  "buyin_required": true,
  "buyin_cost": 55,
  "buyin_purchased": false,
  "buyin_purchased_at": null,
  "buyin_purchased_by": null
}
```

## Testing Checklist

### Purchase Flow
- [ ] Navigate to draft-picks.html
- [ ] Log in as a manager
- [ ] See buy-in buttons for your team's picks
- [ ] Click "Purchase ($X)"
- [ ] See confirmation modal with KAP balance
- [ ] Confirm purchase
- [ ] Verify:
  - [ ] Success message appears
  - [ ] Pick shows as "Purchased"
  - [ ] Discord message posted to channel
  - [ ] draft_order_2026.json updated
  - [ ] wizbucks_transactions.json has new entry
  - [ ] managers.json KAP balance reduced
  - [ ] KAP form shows buy-in as permanent

### Refund Flow (Admin Only)
- [ ] Log in as admin user (role: "admin")
- [ ] See "Refund" button on purchased picks
- [ ] Click "Refund"
- [ ] Confirm refund
- [ ] Verify:
  - [ ] Success message appears
  - [ ] Pick shows as "Not Purchased"
  - [ ] Discord refund message posted
  - [ ] draft_order_2026.json updated
  - [ ] wizbucks_transactions.json has refund entry
  - [ ] managers.json KAP balance restored

### Error Cases
- [ ] Insufficient KAP balance → Shows error
- [ ] Already purchased → Shows error
- [ ] Non-admin tries refund → Shows "Admin access required"
- [ ] Invalid API key → Returns 401
- [ ] Backend offline → Shows error message

## File Changes Summary

### fbp-trade-bot
- **NEW**: `api_buyin.py` - Buy-in API endpoints
- **MODIFIED**: `health.py` - Added buyin router

### fbp-hub
- **MODIFIED**: `js/draft-picks.js` - Backend API integration
- **MODIFIED**: `js/main.js` - Added API key config and dropdown setup
- **MODIFIED**: `css/styles.css` - Navigation dropdown styles
- **MODIFIED**: Navigation HTML in multiple pages - Draft dropdown
- **MODIFIED**: `data/draft_order_2026.json` - Copy from fbp-trade-bot

## Production Checklist

- [ ] BOT_API_KEY environment variable set in backend
- [ ] API key updated in fbp-hub `js/main.js`
- [ ] Backend deployed and restarted
- [ ] Frontend deployed to GitHub Pages
- [ ] Admin users have `"role": "admin"` in managers.json
- [ ] Discord bot has access to channel 1089979265619083444
- [ ] Test purchase with real user account
- [ ] Test refund with admin account
- [ ] Verify KAP form integration

## Rollback Plan

If issues arise:

1. **Frontend rollback**:
   ```bash
   cd /Users/zpressley/fbp-hub
   git revert HEAD
   git push
   ```

2. **Backend rollback**:
   ```bash
   cd /Users/zpressley/fbp-trade-bot
   git revert HEAD
   git push
   ```

3. **Data rollback**:
   - Restore backups of:
     - `data/draft_order_2026.json`
     - `data/wizbucks_transactions.json`
     - `config/managers.json`

## Support

### Common Issues

**"Invalid API key" error**:
- Verify `BOT_API_KEY` matches between frontend and backend
- Check `X-API-Key` header is being sent

**"Admin access required"**:
- Verify user's team has `"role": "admin"` in managers.json
- Check `isAdmin` is properly loaded in draft-picks.js

**Discord notifications not appearing**:
- Verify bot has access to channel 1089979265619083444
- Check bot is online and connected
- Look for Discord errors in backend logs

**Purchase not saving**:
- Check backend logs for errors
- Verify file permissions on data files
- Ensure JSON files are valid before and after

### Logs

Backend logs location (Railway):
- Check stdout for API request logs
- Look for "✅ Posted to Discord"
- Watch for file save errors

Frontend logs:
- Browser console for API errors
- Network tab for failed requests

## Next Steps

After successful deployment:

1. Monitor first few purchases closely
2. Verify data integrity after each transaction
3. Test edge cases (insufficient funds, concurrent purchases)
4. Consider adding:
   - Email notifications
   - Audit trail UI
   - Bulk operations for admins
   - Transaction history page
