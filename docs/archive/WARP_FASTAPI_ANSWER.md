# Answer to WARP: FastAPI Setup in fbp-trade-bot

## Current State

### ✅ **YES - FastAPI Already Exists!**

The bot repository **already has FastAPI integrated** in `health.py`:

```python
# health.py (lines 25-30)
app = FastAPI()

@app.get("/")
def health():
    return {"status": "ok", "bot": str(bot.user)}
```

### Current Architecture

The bot runs **BOTH Discord bot AND FastAPI web server** simultaneously:

```python
# health.py orchestration pattern
async def start_all():
    await bot.start(TOKEN)  # Discord bot

def run_server():
    config = uvicorn.Config(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
    server = uvicorn.Server(config)
    return server.serve()  # FastAPI server

# Both run in same event loop
loop = asyncio.get_event_loop()
loop.create_task(start_all())
loop.run_until_complete(run_server())
```

**Current Deployment**: 
- Hosted on Render
- Single process runs both Discord bot and web server
- Health check endpoint: `GET /` returns bot status

---

## 🎯 Implementation Strategy

### Option A: Integrate into Existing health.py (RECOMMENDED)

**Why this is better:**
- Keeps everything in one file/process
- No duplication of bot initialization
- Existing deployment setup already works
- Simpler to maintain

**Implementation:**

```python
# health.py - ENHANCED VERSION

import os
import asyncio
import discord
from discord.ext import commands
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import uvicorn

# ---- Discord Bot Setup ----
TOKEN = os.getenv("DISCORD_TOKEN")
API_KEY = os.getenv("BOT_API_KEY")  # NEW: For API authentication

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"✅ Bot is online as {bot.user}")

@bot.event
async def setup_hook():
    await bot.load_extension("commands.trade")
    await bot.load_extension("commands.roster")
    await bot.load_extension("commands.player")
    await bot.load_extension("commands.standings")
    await bot.load_extension("commands.auction")  # NEW

# ---- FastAPI Web Server ----
app = FastAPI()

# Health check (existing)
@app.get("/")
def health():
    return {"status": "ok", "bot": str(bot.user)}

# ---- NEW: API Authentication ----
def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True

# ---- NEW: Auction Endpoints ----
class BidRequest(BaseModel):
    team: str
    prospect: str
    amount: int
    bid_type: str
    user_id: str

@app.post("/api/auction/bid")
async def place_bid(bid: BidRequest, authorized: bool = Depends(verify_api_key)):
    """
    Place an auction bid from website via Cloudflare Worker
    """
    from auction_manager import AuctionManager
    
    manager = AuctionManager()
    
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
async def get_current_auction(authorized: bool = Depends(verify_api_key)):
    """
    Return current auction state for website consumption
    """
    import json
    with open("data/auction_current.json", "r") as f:
        return json.load(f)

# ---- Orchestrate Both ----
async def start_all():
    await bot.start(TOKEN)

def run_server():
    config = uvicorn.Config(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
    server = uvicorn.Server(config)
    return server.serve()

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.create_task(start_all())
    loop.run_until_complete(run_server())
```

**Changes Required:**
1. Add `BOT_API_KEY` to Render environment variables
2. Add auction endpoints to existing FastAPI app
3. Add `from fastapi import Depends` import
4. Keep same deployment process (no changes)

---

### Option B: Create Separate api/ Directory (NOT RECOMMENDED)

**Why this is less ideal:**
- Would require separate process/deployment
- Duplicates bot initialization code
- More complex to maintain
- Additional hosting costs on Render

**Only consider if:**
- You want API separate from Discord bot
- You plan to scale API independently
- You need different deployment schedules

---

## 📋 Recommendation for WARP

### ✅ **Use Option A: Enhance health.py**

**Steps:**
1. Keep existing `health.py` structure
2. Add auction endpoints to the existing FastAPI `app` instance
3. Add authentication via API key header
4. Import `AuctionManager` from the new `auction_manager.py`
5. No deployment changes needed - Render already runs health.py

**Files to Create:**
- `auction_manager.py` (new) - Core auction logic
- `commands/auction.py` (new) - Discord commands
- Modify `health.py` (existing) - Add API endpoints

**Files NOT Needed:**
- ~~`api/main.py`~~ - Don't create
- ~~`api/__init__.py`~~ - Don't create
- ~~`api/auction.py`~~ - Don't create separate file

**Deployment:**
- No changes to Render configuration
- health.py already runs on startup
- Just add BOT_API_KEY environment variable

---

## 🔗 Integration Points

### Discord Bot → Auction Manager
```python
# commands/auction.py
from auction_manager import AuctionManager

@app_commands.command(name="bid")
async def place_bid(interaction, prospect, amount, bid_type):
    manager = AuctionManager()
    result = manager.place_bid(team, prospect, amount, bid_type.value)
    # Handle result...
```

### FastAPI → Auction Manager
```python
# health.py (enhanced)
@app.post("/api/auction/bid")
async def place_bid(bid: BidRequest, authorized: bool = Depends(verify_api_key)):
    from auction_manager import AuctionManager
    manager = AuctionManager()
    result = manager.place_bid(bid.team, bid.prospect, bid.amount, bid.bid_type)
    # Handle result...
```

### Website → FastAPI (via Cloudflare Worker)
```javascript
// fbp-hub/js/auction.js
async function placeBid(prospect, amount, bidType) {
    // Website calls Cloudflare Worker
    const response = await fetch('https://fbp-auth.zpressley.workers.dev/api/auction/bid', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prospect, amount, bidType })
    });
    
    // Worker calls bot FastAPI
    // (Worker adds X-API-Key header with BOT_API_KEY)
}
```

---

## 📊 Complete Request Flow

### Placing a Bid from Website

```
1. Manager clicks "Place Bid" on website
   ↓
2. JavaScript validates input (client-side)
   ↓
3. POST to Cloudflare Worker: /api/auction/bid
   - Authorization: Bearer <discord_oauth_token>
   ↓
4. Worker verifies Discord token
   - Gets user's team from MANAGER_MAPPING
   ↓
5. Worker calls Bot FastAPI: POST /api/auction/bid
   - X-API-Key: <BOT_API_KEY>
   - Body: {team, prospect, amount, bid_type}
   ↓
6. Bot FastAPI verifies API key
   ↓
7. Bot calls auction_manager.place_bid()
   - Validates phase, balance, rules
   ↓
8. auction_manager updates data/auction_current.json
   ↓
9. Bot commits and pushes to GitHub
   ↓
10. GitHub Actions webhook triggers website sync
   ↓
11. Website pulls latest data (30 seconds)
   ↓
12. Manager sees updated bid status
```

### Placing a Bid from Discord

```
1. Manager types: /bid prospect:"Jasson Dominguez" amount:15 bid_type:OB
   ↓
2. Discord bot receives slash command
   ↓
3. commands/auction.py handles interaction
   ↓
4. Calls auction_manager.place_bid()
   - Validates phase, balance, rules
   ↓
5. auction_manager updates data/auction_current.json
   ↓
6. Bot commits and pushes to GitHub
   ↓
7. GitHub Actions webhook triggers website sync
   ↓
8. Website pulls latest data (30 seconds)
   ↓
9. Discord confirmation message sent
   ↓
10. Both platforms show identical data
```

---

## 🛠️ Environment Variables

### Render Environment (fbp-trade-bot)

**Existing:**
```bash
DISCORD_TOKEN=<your_discord_bot_token>
GOOGLE_CREDS_JSON=<google_service_account_json>
YAHOO_TOKEN_JSON=<yahoo_api_token_json>
PORT=8000
```

**Add for Auction System:**
```bash
BOT_API_KEY=<generate_random_secret_key>
# Example: openssl rand -hex 32
```

### Cloudflare Worker Environment

**Add:**
```bash
BOT_API_URL=https://fbp-bot.onrender.com
BOT_API_KEY=<same_as_render_bot_api_key>
DISCORD_CLIENT_ID=<discord_oauth_client_id>
DISCORD_CLIENT_SECRET=<discord_oauth_secret>
```

### GitHub Secrets (fbp-trade-bot)

**Add:**
```bash
WEBSITE_REPO_TOKEN=<github_pat_with_repo_scope>
# Used by notify-website.yml to trigger website sync
```

---

## 📝 File Structure Summary

### What EXISTS in fbp-trade-bot:
```
fbp-trade-bot/
├── bot.py                      ✅ Discord bot entry (basic, no FastAPI)
├── health.py                   ✅ FastAPI + Discord bot orchestrator
├── commands/
│   ├── trade.py               ✅ Existing trade commands
│   ├── roster.py              ✅ Existing roster commands
│   ├── player.py              ✅ Existing player lookup
│   └── standings.py           ✅ Existing standings display
├── data/
│   ├── combined_players.json  ✅ Generated daily
│   ├── standings.json         ✅ Generated daily
│   └── wizbucks.json          ✅ Generated daily
└── requirements.txt           ✅ Has discord.py, fastapi, uvicorn
```

### What to CREATE for Auction System:
```
fbp-trade-bot/
├── auction_manager.py          🆕 Core auction logic (NEW FILE)
├── commands/
│   └── auction.py             🆕 Discord /auction and /bid commands (NEW FILE)
├── health.py                  ♻️ ENHANCE with auction endpoints (MODIFY)
├── data/
│   └── auction_current.json   🆕 Weekly auction state (NEW FILE)
└── .github/workflows/
    └── notify-website.yml     🆕 Trigger website sync (NEW FILE)
```

---

## 🚦 Deployment Process

### Current Deployment (Render)
**Entry Point**: `health.py`

```bash
# Render automatically runs:
python3 health.py

# This starts:
1. Discord bot (listening for slash commands)
2. FastAPI server (listening on PORT 8000)
3. Both run indefinitely in same process
```

### After Adding Auction System
**No changes to deployment!**

```bash
# Same command: python3 health.py
# Now includes:
1. Discord bot with /auction and /bid commands
2. FastAPI server with /api/auction/bid endpoint
3. AuctionManager shared by both
```

**Just need to:**
1. Add `BOT_API_KEY` environment variable in Render dashboard
2. Push code to GitHub
3. Render auto-deploys on git push

---

## 🎯 Implementation Checklist for WARP

### Phase 1A: Core Auction Logic
- [ ] Create `auction_manager.py` with AuctionManager class
- [ ] Implement get_current_phase() method
- [ ] Implement place_bid() method with full validation
- [ ] Implement get_committed_wb() method
- [ ] Test locally with mock data

### Phase 1B: Discord Commands
- [ ] Create `commands/auction.py`
- [ ] Implement /auction status command
- [ ] Implement /bid command with choices
- [ ] Add to health.py setup_hook (line 45)
- [ ] Test in Discord server

### Phase 1C: FastAPI Endpoints
- [ ] Enhance health.py with auction endpoints
- [ ] Add BidRequest model
- [ ] Add verify_api_key dependency
- [ ] Add POST /api/auction/bid endpoint
- [ ] Add GET /api/auction/current endpoint
- [ ] Test with curl/Postman

### Phase 2: Repository Integration
- [ ] Create .github/workflows/notify-website.yml
- [ ] Add WEBSITE_REPO_TOKEN secret in GitHub
- [ ] Test webhook trigger (commit to data/)
- [ ] Verify website receives dispatch event

### Phase 3: Cloudflare Worker
- [ ] Update worker.js with auction endpoints
- [ ] Add BOT_API_URL and BOT_API_KEY variables
- [ ] Test worker → bot API communication
- [ ] Verify CORS headers

### Phase 4: Website Frontend
- [ ] Create auction.html
- [ ] Create js/auction.js
- [ ] Implement real-time polling (30s interval)
- [ ] Add bid modal and form validation
- [ ] Test mobile responsiveness

---

## 🔧 Code Integration Points

### Adding Auction to Bot Startup

**Modify health.py line 24:**
```python
@bot.event
async def setup_hook():
    await bot.load_extension("commands.trade")
    await bot.load_extension("commands.roster")
    await bot.load_extension("commands.player")
    await bot.load_extension("commands.standings")
    await bot.load_extension("commands.auction")  # ADD THIS LINE
```

### Sharing AuctionManager

**Both Discord and FastAPI use same instance:**
```python
# auction_manager.py is imported by both:
from auction_manager import AuctionManager

# Discord command:
@app_commands.command(name="bid")
async def place_bid(interaction, ...):
    manager = AuctionManager()  # Fresh instance, loads current state
    result = manager.place_bid(...)

# FastAPI endpoint:
@app.post("/api/auction/bid")
async def place_bid(bid: BidRequest, ...):
    manager = AuctionManager()  # Same class, same data files
    result = manager.place_bid(...)
```

**Why this works:**
- AuctionManager reads/writes to `data/auction_current.json`
- Both platforms access same file on disk
- JSON file is source of truth
- Git commits sync to website

---

## 📖 Additional Context

### Data Pipeline Integration

**Daily Updates (Existing):**
```bash
# .github/workflows/daily-pipeline.yml (existing)
# Runs at 6am EST daily
- update_yahoo_players.py → data/yahoo_players.json
- update_hub_players.py → data/sheet_players.json
- merge_players.py → data/combined_players.json
- save_standings.py → data/standings.json
```

**Auction Updates (New):**
```bash
# Sunday 9pm EST - Process auction results
- auction_manager.process_weekly_auction()
  - Determines winners based on final bids
  - Updates combined_players.json (add PC contracts)
  - Updates wizbucks.json (deduct winning bids)
  - Archives to data/auction_history.json
  - Creates new auction_current.json for next week
  - Commits all changes
  - Triggers website sync webhook
```

### Git Automation

**Bot needs Git configured on Render:**
```bash
# In Render dashboard → Shell (or in startup):
git config --global user.name "FBP Bot"
git config --global user.email "bot@fbp.league"

# Ensure GitHub credentials for push
# Option 1: Use GitHub deploy key
# Option 2: Use PAT token in remote URL
git remote set-url origin https://<PAT_TOKEN>@github.com/zpressley/fbp-trade-bot.git
```

**Important**: Every API endpoint that modifies data should commit and push:
```python
def commit_and_push(file_path, commit_message):
    """Helper to commit data changes"""
    import subprocess
    subprocess.run(["git", "add", file_path], check=True)
    subprocess.run(["git", "commit", "-m", commit_message], check=True)
    subprocess.run(["git", "push"], check=True)
```

---

## 🎬 Next Steps for WARP

### Immediate Actions:
1. **Confirm with Zach**: Is `health.py` the current entry point on Render?
2. **Check Render dashboard**: What command starts the bot?
3. **Verify FastAPI is accessible**: Try visiting `https://fbp-bot.onrender.com/` (should return health check)

### If health.py IS the entry point:
- ✅ Proceed with Option A (enhance health.py)
- ✅ All auction code integrates into existing app
- ✅ No deployment changes needed

### If bot.py IS the entry point:
- ⚠️ Need to migrate to health.py OR
- ⚠️ Create separate FastAPI service

### Either way:
- Create `auction_manager.py` first (it's standalone)
- Test it locally before integrating
- Then add Discord commands
- Finally add FastAPI endpoints

---

## 💡 Key Insight

**The beauty of this architecture:**

Both Discord and Web are just **interfaces** to the same auction logic:

```
auction_manager.py (single source of truth)
        ↓                    ↓
  Discord Bot         FastAPI Endpoints
        ↓                    ↓
   Managers            Managers (Web)
   (Mobile)            (Desktop)
```

No matter which interface a manager uses, they're calling the same validation logic, the same data files, and seeing the same results. The AuctionManager class ensures consistency.

---

## 📞 Questions for Zach

Before WARP proceeds, please confirm:

1. **Entry Point**: Is `health.py` or `bot.py` currently running on Render?
2. **FastAPI Status**: Can you visit your Render URL and see the health check?
3. **Git on Render**: Is Git installed and configured in your Render environment?
4. **API Key**: Do you want me to generate a random BOT_API_KEY or do you have a preferred format?
5. **Auction Processing**: Should Sunday auction processing be automated or manual trigger?

---

**Answer Prepared By:** Claude  
**Date:** January 5, 2026  
**For:** WARP Implementation  
**Re:** FastAPI Integration in fbp-trade-bot
