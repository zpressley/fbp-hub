# FBP Auction Portal Integration - Complete Implementation Guide

## 📋 Document Purpose
This document provides WARP with complete context and implementation instructions to build a fully integrated auction system that connects the Discord bot and website. This includes understanding the two-repository architecture, data synchronization, and step-by-step implementation phases.

---

## 🏗️ Architecture Overview

### Repository Structure

#### **Repository 1: fbp-trade-bot** (Backend/Bot)
- **Location**: Discord bot hosted on Render
- **Purpose**: Discord commands, data pipeline, API integrations
- **Data Generation**: Creates JSON files daily via automated pipeline
- **Key Files**:
  - `bot.py` - Main Discord bot entry point
  - `commands/` - Discord slash commands (trade, roster, player, standings, auction)
  - `data_pipeline/` - Daily automation scripts
  - `data/` - Generated JSON files (this is the source of truth)
  - `google_creds.json` - Google Sheets API credentials
  - `token.json` - Yahoo Fantasy API token

#### **Repository 2: fbp-hub** (Frontend/Website)
- **Location**: GitHub Pages (static hosting)
- **Purpose**: Web interface for managers
- **Data Consumption**: Pulls JSON files from bot repo
- **Key Files**:
  - `index.html`, `players.html`, `rosters.html`, `auction.html`
  - `css/styles.css` - FBP branding (charcoal #1a1a1a, Rangers red #c8102e, blue #003278)
  - `js/main.js`, `js/auth.js`, `js/auction.js`
  - `data/` - Synced from bot repo via GitHub Actions

### Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    DATA FLOW DIAGRAM                              │
└──────────────────────────────────────────────────────────────────┘

1. Data Sources (External APIs)
   ├── Yahoo Fantasy API → Weekly roster updates
   ├── MLB Stats API → Player statistics
   └── Google Sheets → Prospect database, manager info

2. Bot Repository (fbp-trade-bot)
   ├── Daily Pipeline (6am EST via GitHub Actions)
   │   ├── update_yahoo_players.py → data/yahoo_players.json
   │   ├── update_hub_players.py → data/sheet_players.json  
   │   ├── merge_players.py → data/combined_players.json
   │   ├── save_standings.py → data/standings.json
   │   └── update_wizbucks.py → data/wizbucks.json
   │
   ├── Event-Driven Updates (On transaction)
   │   ├── Auction processing → data/auction_current.json
   │   ├── Trade processing → data/transactions.json
   │   └── Triggers webhook to website repo
   │
   └── Discord Bot Commands
       ├── /auction - View current portal
       ├── /bid - Place bids
       └── Discord notifications

3. Website Repository (fbp-hub)
   ├── Receives webhook from bot repo
   ├── Pulls latest data/ files (sync in 30 seconds)
   ├── Rebuilds and deploys automatically
   └── Serves updated data to managers

4. Manager Interaction
   ├── Discord Commands → Bot processes → Updates data → Notifies website
   ├── Website Forms → Cloudflare Worker API → Bot processes → Updates data
   └── Both channels stay synchronized
```

### Repository Communication

```yaml
# Bot Repo → Website Repo Communication
# Trigger: Any commit to data/ directory in bot repo

Bot Repo (fbp-trade-bot):
  - Commit to data/auction_current.json
  - GitHub Action: .github/workflows/notify-website.yml
    - Triggers webhook to website repo
    - Payload includes: timestamp, commit hash, data changed

Website Repo (fbp-hub):
  - Receives: repository_dispatch event
  - GitHub Action: .github/workflows/sync-data.yml
    - Pulls latest data from bot repo
    - Copies to website data/ directory
    - Commits changes (triggers Pages rebuild)
    - Deploys in ~30 seconds
```

---

## 🎯 Phase 1: Auction System Core

### Phase Overview
Build the shared auction management system that both Discord and website will use. This is the foundation that ensures both platforms stay synchronized.

### Dependencies
- **Required Data Files** (already exist):
  - `data/combined_players.json` - All players/prospects
  - `data/standings.json` - Current standings for priority
  - `data/wizbucks.json` - Manager WB balances
  
### What to Build

#### 1. Auction Manager (`auction_manager.py`)
**Location**: `fbp-trade-bot/auction_manager.py`

**Purpose**: Central logic that handles all auction operations, used by both Discord bot and (via API) the website.

**Key Methods**:
```python
class AuctionManager:
    def get_current_phase() -> AuctionPhase
        # Returns current auction phase based on day/time
        # Monday 3pm-Tue: OB_WINDOW
        # Wed-Fri 9pm: CB_WINDOW
        # Saturday: OB_FINAL
        # Sunday: PROCESSING
    
    def place_bid(team, prospect, amount, bid_type) -> dict
        # Validates and places bid
        # Checks: phase, WB balance, bid rules
        # Returns: {"success": True, "bid": {...}} or {"error": "message"}
    
    def get_committed_wb(team) -> int
        # Calculates WB in leading bids
        # Used to check available balance
    
    def load_auction() -> dict
        # Loads data/auction_current.json
    
    def _save_auction(auction)
        # Saves to data/auction_current.json
        # Triggers website notification via commit
```

**Critical Business Rules** (from constitution):
```python
# Originating Bid (OB) Rules:
- Minimum: $10 WB
- Limit: 1 per team per week
- Timing: Mon 3pm - Tue EOD
- Final bid: Saturday (if outbid)

# Challenge Bid (CB) Rules:
- Minimum raise: +$5 over current high bid
- Limit: 1 per team per prospect per day
- Timing: Wed - Fri 9pm EST
- No limit on total CBs per week

# Tiebreakers:
1. Originating manager wins
2. Higher priority (worse standings) wins

# WizBucks:
- Must have available balance (total - committed)
- Committed = sum of your leading bids
- Deducted when bid is leading
- Released if outbid
```

**File Structure**:
```python
# data/auction_current.json
{
    "week_start": "2025-01-06",
    "phase": "ob_window",
    "priority_order": ["SAD", "JEP", "WAR", ...], # Reverse standings
    "bids": [
        {
            "team": "WIZ",
            "prospect": "Jasson Dominguez",
            "amount": 15,
            "type": "OB",
            "timestamp": "2025-01-06T15:30:00Z",
            "date": "2025-01-06"
        },
        {
            "team": "B2J",
            "prospect": "Jasson Dominguez", 
            "amount": 20,
            "type": "CB",
            "timestamp": "2025-01-08T14:00:00Z",
            "date": "2025-01-08"
        }
    ]
}
```

#### 2. Discord Auction Commands (`commands/auction.py`)
**Location**: `fbp-trade-bot/commands/auction.py`

**Commands to Build**:

##### `/auction` - View Current Portal
```python
@app_commands.command(name="auction")
async def auction_status(interaction):
    """
    Shows:
    - Current phase and countdown
    - User's active bids (winning/outbid status)
    - WB balance (total, committed, available)
    - Links to web portal
    """
```

**Output Example**:
```
🏆 **Weekly Auction Portal** - Week of 01/06/2025

📅 Current Phase: **Challenge Bids Open**
   Window closes: Friday 9pm EST

**Your Active Bids:**
🟢 WINNING: Jasson Dominguez - $20 (CB)
🔴 OUTBID: Dylan Crews - $15 (OB) → High bid: $25 by B2J

💰 **WizBucks:** $142 total, $20 committed, $122 available

🌐 View full portal: https://zpressley.github.io/fbp-hub/auction.html
```

##### `/bid` - Place Auction Bid
```python
@app_commands.command(name="bid")
@app_commands.describe(
    prospect="Player name (e.g., 'Jasson Dominguez')",
    amount="Bid amount in $WB (multiples of $5)",
    bid_type="OB for originating, CB for challenge"
)
@app_commands.choices(bid_type=[
    app_commands.Choice(name="Originating Bid (OB)", value="OB"),
    app_commands.Choice(name="Challenge Bid (CB)", value="CB")
])
async def place_bid(interaction, prospect: str, amount: int, bid_type):
    """
    Validates:
    1. User's team identification
    2. Available WB balance
    3. Bid timing (phase check)
    4. Bid rules (minimums, limits)
    
    Then:
    1. Calls auction_manager.place_bid()
    2. Updates data/auction_current.json
    3. Commits to Git (triggers website sync)
    4. Confirms to user
    """
```

**Response Examples**:
```
✅ **Originating Bid Placed!**
Prospect: Jasson Dominguez
Amount: $15
Remaining Available: $127

---

❌ Insufficient WB. You have $122 available.

---

❌ OB window is closed. Challenge bids open Wed-Fri.

---

❌ You already have an OB this week on Dylan Crews.
```

#### 3. Website Auction Interface (`auction.html` + `js/auction.js`)
**Location**: `fbp-hub/auction.html` and `fbp-hub/js/auction.js`

**Key Features**:
```javascript
// Real-time updates (30-second polling)
setInterval(loadAuction, 30000);

// Components:
1. Phase Banner
   - Current phase display
   - Countdown to phase end
   - Color-coded (green=OB, yellow=CB, red=processing)

2. WizBucks Balance Card
   - Total balance
   - Committed amount (in leading bids)
   - Available balance

3. Your Active Bids Section
   - List of all user's bids
   - Status indicators (🟢 winning / 🔴 outbid)
   - Current high bid information
   - Raise buttons for outbid prospects

4. Available Prospects Grid
   - All unowned prospects
   - Current bid display
   - "Place Bid" button (opens modal)
   - Filterable by position/team

5. Bid Modal
   - Prospect info
   - Bid type selector (OB/CB)
   - Amount input (validation)
   - Available balance check
   - Submit button
```

**UI Flow**:
```
User clicks "Place Bid" on prospect
  ↓
Modal opens with prospect info
  ↓
User selects OB or CB
  ↓
User enters amount (validated in real-time)
  ↓
JavaScript checks available WB
  ↓
If valid: POST to Cloudflare Worker API
  ↓
Worker validates and calls bot's API endpoint
  ↓
Bot processes bid (auction_manager.place_bid)
  ↓
Bot commits to data/auction_current.json
  ↓
Bot webhook triggers website sync
  ↓
Website auto-refreshes within 30 seconds
  ↓
User sees updated bid status
```

**Data Loading**:
```javascript
async function loadAuction() {
    // Load auction data
    const auction = await fetch('data/auction_current.json').then(r => r.json());
    
    // Load user's WB balance
    const wb = await fetch('data/wizbucks.json').then(r => r.json());
    
    // Get user team from auth
    const userTeam = getUserTeam(); // From auth.js session
    
    // Update all UI components
    updatePhaseInfo(auction);
    updateWBBalance(wb[userTeam], calculateCommitted(auction, userTeam));
    updateUserBids(auction, userTeam);
    updateProspectsGrid(auction);
}
```

**Styling** (FBP Brand):
```css
/* Core colors */
--background: #1a1a1a;
--surface: #2a2a2a;
--primary: #c8102e;    /* Rangers red */
--secondary: #003278;  /* Rangers blue */
--text: #e0e0e0;

/* Phase indicators */
.phase-ob { background: linear-gradient(135deg, #00ff00 0%, #00aa00 100%); }
.phase-cb { background: linear-gradient(135deg, #ffaa00 0%, #ff6600 100%); }
.phase-processing { background: linear-gradient(135deg, #ff0000 0%, #aa0000 100%); }

/* Bid status */
.bid-winning { border-left: 4px solid #00ff00; }
.bid-losing { border-left: 4px solid #ff0000; }
```

---

## 🔧 Phase 2: Repository Integration

### What to Build

#### 1. Bot Repo: Website Notification Workflow
**Location**: `fbp-trade-bot/.github/workflows/notify-website.yml`

```yaml
name: Notify Website of Data Changes

on:
  push:
    paths:
      - 'data/auction_current.json'
      - 'data/transactions.json'
      - 'data/combined_players.json'
      - 'data/wizbucks.json'
    branches:
      - main

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger website update
        run: |
          curl -X POST \
            -H "Authorization: token ${{ secrets.WEBSITE_REPO_TOKEN }}" \
            -H "Accept: application/vnd.github.v3+json" \
            https://api.github.com/repos/${{ github.repository_owner }}/fbp-hub/dispatches \
            -d '{
              "event_type": "data_updated",
              "client_payload": {
                "source": "bot_repo",
                "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
                "files_changed": "${{ github.event.head_commit.modified }}"
              }
            }'
      
      - name: Log notification
        run: |
          echo "✅ Website notified at $(date)"
          echo "Changed files: ${{ github.event.head_commit.modified }}"
```

**Setup Required**:
1. Create Personal Access Token (PAT) in GitHub with `repo` scope
2. Add as secret in bot repo: `WEBSITE_REPO_TOKEN`

#### 2. Website Repo: Data Sync Workflow
**Location**: `fbp-hub/.github/workflows/sync-data.yml`

```yaml
name: Sync Data from Bot Repo

on:
  # Triggered by bot repo (immediate updates)
  repository_dispatch:
    types: [data_updated]
  
  # Scheduled backup (every 15 minutes)
  schedule:
    - cron: '*/15 * * * *'
  
  # Manual trigger
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout website repo
        uses: actions/checkout@v3
      
      - name: Setup Git
        run: |
          git config user.name "FBP Bot"
          git config user.email "bot@fbp.league"
      
      - name: Pull latest data from bot repo
        run: |
          # Clone bot repo data directory
          git clone --depth 1 --single-branch --branch main \
            https://github.com/${{ github.repository_owner }}/fbp-trade-bot.git temp-bot
          
          # Copy data files
          cp -r temp-bot/data/* data/
          
          # Cleanup
          rm -rf temp-bot
      
      - name: Commit changes
        run: |
          git add data/
          git diff --quiet && git diff --staged --quiet || \
            git commit -m "🔄 Sync data from bot repo [$(date +'%Y-%m-%d %H:%M UTC')]"
      
      - name: Push changes
        run: git push
      
      - name: Summary
        run: |
          echo "### 🎉 Data Synced Successfully" >> $GITHUB_STEP_SUMMARY
          echo "Timestamp: $(date -u)" >> $GITHUB_STEP_SUMMARY
          echo "Source: Bot repository" >> $GITHUB_STEP_SUMMARY
```

**Result**: 
- Website updates within ~30 seconds of bot data change
- Fallback: Syncs every 15 minutes even if webhook fails
- All managers see updates simultaneously

---

## 🌐 Phase 3: API Layer (Cloudflare Worker)

### Purpose
Cloudflare Worker acts as the serverless API that allows the website to trigger bot actions (like placing bids) without exposing bot credentials.

### What to Build

#### Cloudflare Worker Endpoints
**Location**: Cloudflare Workers dashboard (separate from both repos)

```javascript
// worker.js - Deployed to Cloudflare Workers

// Environment variables (set in Cloudflare dashboard):
// - BOT_API_URL: https://fbp-bot.onrender.com
// - BOT_API_KEY: Secret key for authentication

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'https://zpressley.github.io',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }
    
    const url = new URL(request.url);
    
    // Route: POST /api/auction/bid
    if (url.pathname === '/api/auction/bid' && request.method === 'POST') {
        return await handleBid(request);
    }
    
    // Route: GET /api/auction/current
    if (url.pathname === '/api/auction/current' && request.method === 'GET') {
        return await getAuction(request);
    }
    
    return jsonResponse({ error: 'Not found' }, 404);
}

async function handleBid(request) {
    try {
        // 1. Verify user authentication (Discord OAuth token)
        const authHeader = request.headers.get('Authorization');
        const user = await verifyAuth(authHeader);
        if (!user) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        
        // 2. Parse bid data
        const data = await request.json();
        const { prospect, amount, bidType } = data;
        
        // 3. Call bot API (Render deployment)
        const botResponse = await fetch(`${BOT_API_URL}/api/auction/bid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': BOT_API_KEY,
            },
            body: JSON.stringify({
                team: user.team,
                prospect,
                amount,
                bid_type: bidType,
                user_id: user.discord_id,
            }),
        });
        
        const result = await botResponse.json();
        
        // 4. Return result to website
        return jsonResponse(result, botResponse.status);
        
    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
}

async function verifyAuth(authHeader) {
    // Verify Discord OAuth token
    // Return user object with: discord_id, username, team
    // (Implementation depends on auth system from Phase 2)
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
    });
}
```

#### Bot API Endpoint (Render)
**Location**: `fbp-trade-bot/api/auction.py`

```python
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import os

app = FastAPI()

# API key authentication
API_KEY = os.getenv("BOT_API_KEY")

def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True

class BidRequest(BaseModel):
    team: str
    prospect: str
    amount: int
    bid_type: str
    user_id: str

@app.post("/api/auction/bid")
async def place_bid(bid: BidRequest, authorized: bool = Depends(verify_api_key)):
    """
    Handle bid placement from website via Cloudflare Worker
    """
    from auction_manager import AuctionManager
    
    manager = AuctionManager()
    
    # Place bid
    result = manager.place_bid(
        team=bid.team,
        prospect_name=bid.prospect,
        amount=bid.amount,
        bid_type=bid.bid_type
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    # Commit data change (triggers website webhook)
    import subprocess
    subprocess.run(["git", "add", "data/auction_current.json"])
    subprocess.run([
        "git", "commit", "-m", 
        f"Auction: {bid.bid_type} ${bid.amount} on {bid.prospect} by {bid.team}"
    ])
    subprocess.run(["git", "push"])
    
    return result

@app.get("/api/auction/current")
async def get_current_auction():
    """
    Return current auction state
    """
    import json
    with open("data/auction_current.json", "r") as f:
        return json.load(f)
```

**Deployment on Render**:
```bash
# Add to existing bot deployment
# In Render dashboard → Environment:
BOT_API_KEY=<generate_random_secret>

# Ensure requirements.txt has:
fastapi
uvicorn[standard]
pydantic

# Update health.py to include API routes
```

---

## 📱 Phase 4: Mobile-First UI Polish

### Responsive Design Requirements

#### Mobile (375px - 768px)
```css
/* Auction Portal Mobile */
.phase-banner {
    font-size: 1.2em;
    padding: 15px;
}

.your-bids {
    padding: 15px;
}

.bid-card {
    flex-direction: column;
    gap: 10px;
}

.available-prospects {
    grid-template-columns: 1fr; /* Single column on mobile */
}

.prospect-card {
    padding: 15px;
}

/* Bid Modal Mobile */
.modal-content {
    width: 95%;
    padding: 20px;
}

input[type="number"] {
    font-size: 16px; /* Prevents zoom on iOS */
}
```

#### Touch Interactions
```javascript
// Swipe to refresh on mobile
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', async (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    
    // Pull down gesture
    if (touchEndY - touchStartY > 100 && window.scrollY === 0) {
        showRefreshIndicator();
        await loadAuction();
        hideRefreshIndicator();
    }
});

// Larger touch targets (minimum 44px)
.btn-bid {
    min-height: 44px;
    min-width: 44px;
}
```

---

## 🧪 Testing Plan

### Phase 1 Testing
```bash
# Test auction manager locally
cd fbp-trade-bot
python3 -c "
from auction_manager import AuctionManager
m = AuctionManager()
print('Current phase:', m.get_current_phase())
print('Test bid:', m.place_bid('WIZ', 'Jasson Dominguez', 15, 'OB'))
"

# Test Discord commands
# In Discord: /auction
# In Discord: /bid prospect:"Jasson Dominguez" amount:15 bid_type:OB
```

### Phase 2 Testing
```bash
# Test webhook trigger
cd fbp-trade-bot
echo "test" >> data/auction_current.json
git add data/auction_current.json
git commit -m "Test webhook"
git push

# Watch website repo Actions tab
# Should see "Sync Data from Bot Repo" running
# Should complete in ~30 seconds
```

### Phase 3 Testing
```bash
# Test Cloudflare Worker
curl https://fbp-auth.zpressley.workers.dev/api/auction/current

# Test website bid submission
# 1. Login to website
# 2. Navigate to /auction.html
# 3. Click "Place Bid" on any prospect
# 4. Submit bid
# 5. Check Discord for notification
# 6. Verify data/auction_current.json updated
```

---

## 🚀 Deployment Steps

### Step 1: Deploy Bot Changes
```bash
cd fbp-trade-bot

# Add new files
git add auction_manager.py
git add commands/auction.py
git add api/auction.py
git add .github/workflows/notify-website.yml

# Commit
git commit -m "Phase 1: Auction system core + Discord commands"

# Push to Render
git push origin main
```

### Step 2: Configure GitHub Secrets
```bash
# In fbp-trade-bot repo Settings → Secrets:
# Add: WEBSITE_REPO_TOKEN (GitHub PAT with repo scope)

# In Render dashboard:
# Add environment variable: BOT_API_KEY
```

### Step 3: Deploy Website Changes
```bash
cd fbp-hub

# Add new files
git add auction.html
git add js/auction.js
git add .github/workflows/sync-data.yml

# Commit
git commit -m "Phase 1: Auction portal frontend"

# Push to GitHub Pages
git push origin main
```

### Step 4: Deploy Cloudflare Worker
```
1. Login to Cloudflare dashboard
2. Workers & Pages → Create Worker
3. Name: fbp-auth
4. Paste worker.js code
5. Add environment variables:
   - BOT_API_URL: https://fbp-bot.onrender.com
   - BOT_API_KEY: (same as Render)
6. Deploy
```

### Step 5: Verify Integration
```
1. Discord: /auction → Should show current portal
2. Discord: /bid → Should place bid successfully
3. Website: Visit /auction.html → Should show same data
4. Website: Place bid via form → Should update Discord
5. Both: Verify data updates within 30 seconds
```

---

## 📊 Success Criteria

### Functional Requirements
- ✅ Managers can view auction portal in Discord and web
- ✅ Managers can place bids from either platform
- ✅ Bids follow all constitution rules (timing, amounts, limits)
- ✅ WizBucks balances update in real-time
- ✅ Both platforms show identical data
- ✅ Updates sync within 30 seconds

### Technical Requirements
- ✅ No manual data copying between repos
- ✅ Zero hosting costs (GitHub Pages + Cloudflare free tier)
- ✅ Mobile-responsive design (works on phones)
- ✅ Secure authentication (Discord OAuth)
- ✅ API rate limits respected
- ✅ Error handling and user feedback

### User Experience
- ✅ Simple bid placement (3 clicks)
- ✅ Clear status indicators (winning/outbid)
- ✅ Real-time balance calculations
- ✅ Mobile-friendly touch targets
- ✅ Fast load times (<2 seconds)
- ✅ Works offline (read-only cached data)

---

## 🔍 Additional Context from Past Chats

### Repository Communication Pattern
From previous implementation (Website Dev 002):
- Bot repo has PAT token secret for website repo
- Website repo syncs on `repository_dispatch` events
- Fallback: 15-minute scheduled sync
- Both repos use GitHub Actions (free tier)

### Authentication System
From previous implementation (Website Dev 002):
- Discord OAuth via Cloudflare Workers
- 7-day session persistence
- Manager team identification from Discord ID mapping
- Commissioner role detection for admin features

### Data Pipeline
From previous discussions (Fantasy Baseball Discord Bot Project):
- Daily automation at 6am EST via GitHub Actions
- Yahoo API token expires 1/20/2025 (needs refresh)
- Google Sheets as source of truth for prospects
- Combined players JSON merges Yahoo + Sheet data

### FBP Business Rules
From constitution (FBP20Constitution20Overhaul202026_pdf.pdf):
- 12 teams with 3-letter abbreviations
- WizBucks allocated in 3 installments (PAD, KAP, APA)
- Prospect contracts: DC ($5), PC ($10), BC ($20)
- Service time tracking: MLB limits vs FBP limits
- Weekly auction portal replaces old waiver system

---

## 🛠️ Troubleshooting Guide

### Issue: Webhook not triggering website sync
**Solution**:
```bash
# Check bot repo secret
gh secret list --repo fbp-trade-bot

# Test webhook manually
curl -X POST \
  -H "Authorization: token YOUR_PAT_TOKEN" \
  https://api.github.com/repos/YOUR_USERNAME/fbp-hub/dispatches \
  -d '{"event_type":"data_updated"}'

# Check website Actions tab for "Sync Data" workflow
```

### Issue: Discord command not responding
**Solution**:
```bash
# Check Render logs
render logs --tail 100

# Test auction manager locally
python3 auction_manager.py

# Verify Discord bot is online
# Check Render dashboard for errors
```

### Issue: Website showing stale data
**Solution**:
```bash
# Force manual sync
# In website repo → Actions → "Sync Data from Bot Repo" → Run workflow

# Check last sync time
cat data/auction_current.json | jq '.last_updated'

# Clear browser cache
# Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

### Issue: Cloudflare Worker 401 errors
**Solution**:
```bash
# Verify API key matches
# Render dashboard → Environment → BOT_API_KEY
# Cloudflare dashboard → Workers → Settings → Variables → BOT_API_KEY

# Test worker health
curl https://fbp-auth.zpressley.workers.dev/health

# Check CORS settings
# Verify Access-Control-Allow-Origin matches GitHub Pages URL
```

---

## 📚 Key Files Reference

### Bot Repository (fbp-trade-bot)
```
fbp-trade-bot/
├── auction_manager.py          # Core auction logic
├── commands/
│   └── auction.py              # Discord /auction and /bid commands
├── api/
│   └── auction.py              # FastAPI endpoints for website
├── data/
│   ├── auction_current.json    # Weekly auction state
│   ├── combined_players.json   # All players/prospects
│   ├── standings.json          # Current standings (for priority)
│   └── wizbucks.json           # Manager balances
├── .github/workflows/
│   ├── notify-website.yml      # Triggers website sync
│   └── daily-pipeline.yml      # 6am data updates (existing)
└── requirements.txt            # Add: fastapi, uvicorn
```

### Website Repository (fbp-hub)
```
fbp-hub/
├── auction.html                # Auction portal page
├── js/
│   ├── auction.js              # Auction page logic
│   ├── auth.js                 # Discord OAuth (existing)
│   └── main.js                 # Shared utilities (existing)
├── css/
│   └── styles.css              # FBP branding (existing)
├── data/                       # Synced from bot repo
│   ├── auction_current.json
│   ├── combined_players.json
│   ├── standings.json
│   └── wizbucks.json
└── .github/workflows/
    └── sync-data.yml           # Pulls data from bot repo
```

### Cloudflare Worker
```
Cloudflare Dashboard → Workers:
├── fbp-auth                    # Worker name
├── worker.js                   # API endpoints code
└── Environment Variables:
    ├── BOT_API_URL             # https://fbp-bot.onrender.com
    └── BOT_API_KEY             # Secret for authentication
```

---

## 🎯 Implementation Checklist

### Pre-Implementation
- [ ] Verify bot repo has Discord OAuth working
- [ ] Verify website repo has GitHub Pages enabled
- [ ] Verify Cloudflare Workers account created
- [ ] Generate GitHub PAT token with `repo` scope
- [ ] Refresh Yahoo API token (expires 1/20/2025)

### Phase 1: Auction Core
- [ ] Create `auction_manager.py` in bot repo
- [ ] Add auction business logic (phases, bids, validation)
- [ ] Test locally with sample data
- [ ] Create `commands/auction.py` in bot repo
- [ ] Register Discord slash commands
- [ ] Test `/auction` command in Discord
- [ ] Test `/bid` command in Discord
- [ ] Create `auction.html` in website repo
- [ ] Create `js/auction.js` in website repo
- [ ] Test website UI with mock data
- [ ] Verify mobile responsiveness

### Phase 2: Repository Integration
- [ ] Add WEBSITE_REPO_TOKEN secret to bot repo
- [ ] Create `.github/workflows/notify-website.yml` in bot repo
- [ ] Create `.github/workflows/sync-data.yml` in website repo
- [ ] Test webhook trigger (commit to bot data/)
- [ ] Verify website syncs within 30 seconds
- [ ] Test scheduled sync (wait 15 minutes)

### Phase 3: API Layer
- [ ] Create Cloudflare Worker `fbp-auth`
- [ ] Add worker.js code with bid endpoint
- [ ] Configure environment variables
- [ ] Create `api/auction.py` in bot repo
- [ ] Add BOT_API_KEY to Render
- [ ] Test Cloudflare Worker endpoints
- [ ] Test website → Worker → Bot flow
- [ ] Verify bot commits trigger website sync

### Phase 4: Polish & Testing
- [ ] Add mobile touch interactions
- [ ] Test on iPhone (Safari)
- [ ] Test on Android (Chrome)
- [ ] Add loading indicators
- [ ] Add error messages
- [ ] Test edge cases (low WB, wrong phase, etc.)
- [ ] Performance test (load time <2s)
- [ ] Cross-browser testing

### Deployment
- [ ] Deploy bot changes to Render
- [ ] Deploy website changes to GitHub Pages
- [ ] Deploy Cloudflare Worker
- [ ] Monitor logs for 24 hours
- [ ] Document any issues
- [ ] Update README files

### Post-Launch
- [ ] Train managers on new system
- [ ] Monitor first week of auctions
- [ ] Collect user feedback
- [ ] Plan Phase 2 features

---

## 📞 Support & Resources

### Documentation
- GitHub Actions: https://docs.github.com/en/actions
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Discord API: https://discord.com/developers/docs
- Render: https://render.com/docs

### FBP Resources
- Constitution: `/mnt/project/FBP20Constitution20Overhaul202026_pdf.pdf`
- 2025 Changes: `/mnt/project/2025_FBP_Launch_Deck__1___5_.pdf`
- Project Context: `/mnt/project/project_context_doc.md`
- Handoff Context: `/mnt/project/handoff_context.md`

### Quick Links
- Bot Repo: https://github.com/zpressley/fbp-trade-bot
- Website Repo: https://github.com/zpressley/fbp-hub
- Live Website: https://zpressley.github.io/fbp-hub
- Discord Server: https://discord.com/channels/875592505926758480

---

## ✅ Final Notes for WARP

### Implementation Philosophy
1. **Build in testable chunks** - Each phase can be implemented and tested independently
2. **Fail gracefully** - Website works read-only even if API is down
3. **Mobile-first** - Many managers primarily use phones
4. **Zero trust** - Validate everything on both client and server
5. **Keep it simple** - Avoid over-engineering; use proven patterns

### Code Standards
```python
# Python (bot repo)
- Follow PEP 8 style guide
- Use type hints
- Write docstrings for all functions
- Add logging for debugging
- Handle exceptions gracefully

# JavaScript (website repo)
- Use modern ES6+ syntax
- Write JSDoc comments
- Use async/await over callbacks
- Add try/catch blocks
- Log errors to console

# CSS
- Mobile-first breakpoints
- Use CSS variables for colors
- Touch-friendly sizing (44px minimum)
- Test on real devices
```

### Git Commit Messages
```bash
# Format: Type: Brief description
# Examples:
git commit -m "feat: Add auction manager core logic"
git commit -m "fix: Correct WB balance calculation"
git commit -m "docs: Update API documentation"
git commit -m "test: Add unit tests for bid validation"
git commit -m "refactor: Simplify phase detection logic"
```

### Questions for Zach
Before starting implementation, confirm:
1. Is Yahoo API token still valid? (expires 1/20/2025)
2. Are Discord IDs in MANAGER_MAPPING current?
3. Should auction process automatically on Sundays?
4. Any changes to FBP business rules since 2025 launch?
5. Preferred domain name if we move off GitHub Pages?

---

**END OF DOCUMENT**

*Last Updated: January 4, 2026*
*Version: 1.0*
*Author: Claude (for WARP implementation)*
