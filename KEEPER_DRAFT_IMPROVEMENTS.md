# Keeper Draft Improvements - Task List

## Completed ✅
1. Added FantasyPros ADP rankings to players
2. Fixed Draft Preview View Picks button  
3. Added keeper filters to draft preview (Position, Team)
4. Implemented keeper draft grid filtering (rounds 1-3 buy-ins, rounds 4+ tax filtering)
5. Built keeper player pool with rank sorting

## Remaining Tasks

### 1. Draft Pool Filters (draft.html / draft.js)
**Current Issue**: Prospect filters showing in keeper mode
**Fix Needed**:
- Hide FV Year, Status, Badge Type filters when in keeper mode
- Show only Position and Team filters for keeper
- Ensure filters persist when switching modes

### 2. Sortable Table Headers
**Fix Needed**: 
- Make draft pool table headers clickable to sort
- Currently only prospect table has sorting wired up
- Add sorting for keeper table columns (Rank, Player, Team, Pos, Age)

### 3. Default to Keeper Mode
**Fix Needed**:
- Change default mode from 'prospect' to 'keeper' in DRAFT_STATE (line 23 in draft.js)
- Change default mode in draft-preview.js initial tab selection
- Update HTML to have keeper tab active by default

### 4. Re-rank Players in Draft Pool
**Current**: Shows actual FantasyPros rank (1-526)
**Needed**: Re-rank available players 1-N based on who's left
- Player with lowest rank among available becomes #1
- Create dynamic ranking in buildDraftPoolKeepers()

### 5. Update Grid Round Labels
**Current**: "Round 1 - FYPD", "Round 2 - DC"
**Needed**: 
- Rounds 1-3: "Round X - VC" (Veteran Contract rounds)
- Rounds 4+: "Round X" (normal rounds, no special label)
- Remove all prospect draft language

### 6. Add 2025 Stats to Player Pool
**Data Source**: `/Users/zpressley/fbp-trade-bot/data/stats/yahoo_players_2025_stats.csv`

**Batter Stats** (10 columns):
- H/AB (Hits/At Bats) - display as-is from CSV
- R (Runs)
- H (Hits)
- HR (Home Runs)  
- RBI
- SB (Stolen Bases)
- BB (Walks)
- K (Strikeouts)
- TB (Total Bases)
- AVG (Batting Average)
- OPS

**Pitcher Stats** (11 columns):
- APP (Appearances)
- IP (Innings Pitched)
- ER (Earned Runs)
- HR (Home Runs Allowed)
- K (Strikeouts)
- TB (Total Bases Allowed)
- ERA
- K/9
- H/9
- BB/9
- QS (Quality Starts)

### 7. Create Keeper Draft Pool JSON
**File**: `data/keeper_pool_2026.json`
**Content**: Merge combined_players.json MLB players with yahoo_players_2025_stats.csv
**Structure**:
```json
[
  {
    "upid": 1886,
    "name": "Aaron Judge",
    "team": "NYY",
    "position": "OF",
    "rank": 2,
    "age": 32,
    "stats_2025": {
      "H/AB": "150/500",
      "R": 120,
      "H": 150,
      "HR": 45,
      "RBI": 110,
      "SB": 5,
      "BB": 85,
      "K": 145,
      "TB": 350,
      "AVG": ".300",
      "OPS": "1.100"
    }
  }
]
```

### 8. Update Draft Pool Display
**Changes Needed**:
- Add all stat columns to keeper pool table
- Make table scrollable horizontally on mobile
- Each stat column should be sortable
- Update buildDraftPoolKeepers() to load from keeper_pool_2026.json instead of combined_players
- Show stats for both batter and pitcher (all columns, show '-' for N/A)

### 9. Update Draft Preview Keeper Display  
- Add same stat columns to draft-preview.html keeper grid
- Make all columns sortable
- Load from keeper_pool_2026.json

## Implementation Notes

### CSV Column Mapping
From yahoo_players_2025_stats.csv:
- Columns for batters: H/AB, R, H, HR, RBI, SB, BB, K, TB, AVG, OPS
- Columns for pitchers: APP, IP, ER, HR (pitcher), K, TB, ERA, K/9, H/9, BB/9, QS
- Match players by name (fuzzy match) or create UPID column in CSV

### Sortable Headers
```javascript
// Example pattern from prospect table
header.addEventListener('click', () => {
    const field = header.dataset.sort;
    // Toggle sort direction
    // Re-render table with new sort
});
```

### Mobile Scrolling
```css
.draft-pool-table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
```

## Priority Order
1. Create keeper_pool_2026.json with merged stats data
2. Update default mode to keeper
3. Fix draft pool filters for keeper mode
4. Add stats columns to pool displays
5. Implement sorting for all columns
6. Update grid round labels (VC rounds)
7. Re-rank players dynamically

## Files to Modify
- `/Users/zpressley/fbp-hub/js/draft.js`
- `/Users/zpressley/fbp-hub/js/draft-preview.js`
- `/Users/zpressley/fbp-hub/draft-preview.html`
- `/Users/zpressley/fbp-hub/css/draft.css` (for mobile scrolling)
- Create: `/Users/zpressley/fbp-hub/data/keeper_pool_2026.json`
- Create script: `/Users/zpressley/fbp-trade-bot/scripts/build_keeper_pool.py`
