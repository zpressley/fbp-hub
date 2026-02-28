# Cloudflare Worker - Roster Endpoint Implementation

Add this code to your Cloudflare Worker to support roster persistence.

## 1. Add Route Handler (in `fetch()` method)

Add this **after the `/api/notes` handler** (around line 124):

```javascript
// --- Manager Roster ---
if (path === '/api/roster' && (request.method === 'GET' || request.method === 'POST')) {
  return await proxyToBotAsManager(`/api/roster${url.search}`, env, request);
}
```

**Full context:**
```javascript
// --- Manager Notes ---
if (path === '/api/notes' && (request.method === 'GET' || request.method === 'POST')) {
  return await proxyToBotAsManager(`/api/notes${url.search}`, env, request);
}

// --- Manager Roster ---  ← ADD THIS
if (path === '/api/roster' && (request.method === 'GET' || request.method === 'POST')) {
  return await proxyToBotAsManager(`/api/roster${url.search}`, env, request);
}

// --- Manager Self-Service APIs ---
if (path === '/api/manager/contract-purchase' && request.method === 'POST') {
  return await proxyToBot('/api/manager/contract-purchase', env, request);
}
```

## 2. Backend API Implementation (fbp-trade-bot)

In your `fbp-trade-bot` repository, add these two endpoints:

### GET `/api/roster` - Load roster

```python
from fastapi import APIRouter, Header, HTTPException
from typing import Optional
import json

router = APIRouter()

@router.get("/api/roster")
async def get_roster(x_manager_team: Optional[str] = Header(None)):
    """
    Load a manager's saved roster assignments.
    Returns: { "roster": { "assignments": {...}, "season": 2025, "updated": "..." } }
    """
    if not x_manager_team:
        raise HTTPException(status_code=401, detail="Manager team header missing")
    
    team = x_manager_team.upper()
    
    try:
        # Use your existing KV store (same pattern as notes)
        key = f"roster:{team}"
        stored = await kv_store.get(key)
        
        if stored:
            roster_data = json.loads(stored)
            return {"roster": roster_data}
        else:
            # No saved roster - return empty
            return {"roster": None}
            
    except Exception as e:
        logger.error(f"Failed to load roster for {team}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load roster")
```

### POST `/api/roster` - Save roster

```python
@router.post("/api/roster")
async def save_roster(
    payload: dict,
    x_manager_team: Optional[str] = Header(None)
):
    """
    Save a manager's roster assignments.
    Payload: { "roster": { "assignments": {...}, "season": 2025, "updated": "..." } }
    """
    if not x_manager_team:
        raise HTTPException(status_code=401, detail="Manager team header missing")
    
    team = x_manager_team.upper()
    roster_data = payload.get("roster")
    
    if not roster_data:
        raise HTTPException(status_code=400, detail="Missing roster data")
    
    # Validate structure
    if not isinstance(roster_data.get("assignments"), dict):
        raise HTTPException(status_code=400, detail="Invalid roster format")
    
    try:
        # Store in KV (same pattern as notes)
        key = f"roster:{team}"
        await kv_store.set(key, json.dumps(roster_data))
        
        return {
            "success": True,
            "team": team,
            "message": "Roster saved successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to save roster for {team}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save roster")
```

## 3. Storage Pattern

**Key format:** `roster:{TEAM_ABBREVIATION}`

**Examples:**
- `roster:WIZ`
- `roster:HAM`
- `roster:B2J`

**Stored value (JSON):**
```json
{
  "assignments": {
    "C": "123456",
    "1B": "789012",
    "2B": "345678",
    "SS": "901234",
    "3B": "567890",
    "CF": "234567",
    "OF1": "890123",
    "OF2": "456789",
    "UTIL": "012345",
    "SP": "678901",
    "RP": "234568",
    "P1": "890124",
    "P2": "456790",
    "P3": "012346",
    "P4": "678902"
  },
  "season": 2025,
  "updated": "2026-02-28T14:06:27.123Z"
}
```

## 4. Authentication Flow

1. Frontend sends `Authorization: Bearer <discord_token>`
2. Worker validates token via Discord API
3. Worker maps Discord ID → Team abbreviation (MANAGER_MAPPING)
4. Worker forwards to bot with `X-Manager-Team: WIZ`
5. Bot uses team header to read/write `roster:WIZ` in KV store

## 5. Testing

### Save roster
```bash
curl -X POST https://fbp-auth.zpressley.workers.dev/api/roster \
  -H "Authorization: Bearer YOUR_DISCORD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roster": {
      "assignments": {"C": "123456", "1B": "789012"},
      "season": 2025,
      "updated": "2026-02-28T14:06:27Z"
    }
  }'
```

### Load roster
```bash
curl https://fbp-auth.zpressley.workers.dev/api/roster \
  -H "Authorization: Bearer YOUR_DISCORD_TOKEN"
```

## 6. Benefits

✅ **Cross-device sync** - Set lineup on mobile, see it on desktop  
✅ **Persistent** - Survives browser cache clearing  
✅ **Backed up** - Stored in Cloudflare KV  
✅ **Secure** - Tied to authenticated Discord account  
✅ **Fast** - localStorage cache + backend sync  
✅ **Graceful** - Falls back to localStorage if offline  

## 7. Deployment Checklist

- [ ] Add route handler to Cloudflare Worker
- [ ] Deploy worker to Cloudflare
- [ ] Add endpoints to fbp-trade-bot
- [ ] Verify KV store is accessible
- [ ] Test with curl/Postman
- [ ] Test in dashboard (save/load roster)
- [ ] Verify cross-device sync
