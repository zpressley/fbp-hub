# FBP Complete Data Architecture Specification
# All data files needed for Discord bot + FBP Hub website

## ============================================================================
## 1. PLAYER DATABASE (combined_players.json) - ENHANCED
## ============================================================================

Purpose: Master player database with complete bio + current status
Update: Daily during season, event-driven during offseason
Size estimate: ~3 MB (2,500 players with full bio)

Structure:
```json
{
  "upid": "12345",
  "name": "Mike Trout",
  "mlb_id": 545361,
  "yahoo_id": "8370",
  
  // Bio data (from MLB API)
  "bio": {
    "birthDate": "1991-08-07",
    "age": 33,
    "birthCity": "Vineland",
    "birthStateProvince": "NJ",
    "birthCountry": "USA",
    "height": "6' 2\"",
    "weight": 235,
    "bats": "R",
    "throws": "R",
    "primaryPosition": "CF",
    "mlbDebutDate": "2011-07-08",
    "draftYear": "2009",
    "draftRound": "1",
    "draftPick": "25",
    "college": null,
    "pronunciation": "MIKE TROUT"
  },
  
  // FBP data (from Google Sheets)
  "fbp": {
    "player_type": "MLB",
    "manager": "WIZ",
    "position": "CF",
    "mlb_team": "LAA",
    "contract_type": "FC",
    "contract_years": "FC-2",
    "salary": 125,
    "il_tag": false,
    "on_yahoo_roster": true,
    "on_30man_roster": true
  }
}
```

Sources:
- MLB API: /api/v1/people/{mlb_id} (bio data)
- Google Sheets: Player Data tab (FBP data)
- Yahoo API: League rosters (roster status)

Update scripts:
- data_pipeline/update_yahoo_players.py
- data_pipeline/update_hub_players.py
- NEW: data_pipeline/update_mlb_bio.py
- data_pipeline/merge_players.py (enhanced)


## ============================================================================
## 2. COMPREHENSIVE STATS DATABASE (player_stats.json)
## ============================================================================

Purpose: Multi-season stats for all players
Update: Daily for current season, historical data static
Size estimate: ~50-100 MB (2,500 players × 10 years × multiple stat types)

Structure:
```json
{
  "12345": {  // Keyed by UPID
    "name": "Mike Trout",
    "mlb_id": 545361,
    "seasons": {
      "2024": {
        "mlb": {
          "batting": {
            "source": "yahoo",  // or "mlb_api" or "fangraphs"
            "games": 119,
            "atBats": 425,
            "runs": 79,
            "hits": 115,
            "doubles": 18,
            "triples": 2,
            "homeRuns": 10,
            "rbi": 44,
            "stolenBases": 5,
            "avg": 0.220,
            "obp": 0.325,
            "slg": 0.541,
            "ops": 0.866,
            // Fangraphs advanced
            "wOBA": 0.345,
            "wRC+": 138,
            "ISO": 0.321,
            "BABIP": 0.245,
            "Off": 12.5,  // Offensive runs above average
            "BsR": 0.8,
            "BB%": 12.5,
            "K%": 18.2
          }
        },
        "milb": null  // No minors for MLB players
      },
      "2023": {
        // ... previous season
      }
    }
  },
  "67890": {  // Prospect example
    "name": "Jackson Chourio",
    "mlb_id": 694160,
    "seasons": {
      "2024": {
        "mlb": {
          "batting": { /* MLB stats */ }
        },
        "milb": {
          "AAA": {
            "games": 89,
            "atBats": 367,
            "avg": 0.284,
            "homeRuns": 12,
            // ... full stats
          },
          "AA": {
            "games": 45,
            // ... stats at each level
          }
        }
      }
    }
  }
}
```

Sources:
- Yahoo API: Current MLB stats (basic)
- MLB Stats API: Current MLB stats (detailed) + all MiLB levels
- Fangraphs CSVs: Advanced MLB stats (wOBA, wRC+, FIP, etc.)
- MLB Prospect CSVs: Aggregate prospect stats
- pybaseball: Historical Fangraphs data

Feasibility for 2-3K players × 10-20 years:
✅ YES - but use smart caching:
- Store last 3 years in main JSON (~20 MB)
- Archive older years in separate files by season
- Load on-demand for historical lookups

Update scripts:
- NEW: data_pipeline/build_stats_database.py (master builder)
- NEW: data_pipeline/update_current_season_stats.py (daily)
- NEW: data_pipeline/import_historical_fangraphs.py (one-time)


## ============================================================================
## 3. WIZBUCKS COMPLETE DATABASE (wizbucks.json)
## ============================================================================

Purpose: Complete WizBucks tracking system
Update: Real-time during transactions, daily balance check
Size estimate: ~500 KB

Structure:
```json
{
  "balances": {
    "WIZ": {
      "current_total": 142,
      "installments": {
        "PAD": {
          "allocated": 100,
          "spent": 45,
          "committed": 10,  // Auction bids
          "available": 45,
          "rolled_from_previous": 25
        },
        "KAP": {
          "allocated": 375,
          "spent": 285,
          "committed": 0,
          "available": 90,
          "rolled_from_PAD": 30
        },
        "APA": {
          "allocated": 100,
          "spent": 35,
          "committed": 15,
          "available": 50,
          "rolled_from_KAP": 100
        },
        "TDA": {
          "allocated": 15,
          "spent": 0,
          "available": 15
        }
      },
      "tax_bracket": {
        "total_spend": 285,
        "taxed_rounds": [6, 7, 8],
        "max_spend": 435
      }
    }
    // ... all 12 teams
  },
  
  "transactions": [
    {
      "transaction_id": "txn_001",
      "date": "2025-02-15T14:30:00",
      "team": "WIZ",
      "type": "prospect_purchase",
      "amount": -10,
      "period": "PAD",
      "description": "Purchased Jackson Chourio (PC)",
      "upid": "67890"
    }
    // ... all transactions
  ]
}
```

Sources:
- Google Sheets: FBP HUB WizBucks tab
- Bot events: Trades, purchases, auctions
- Manual adjustments: Commissioner corrections

Update scripts:
- data_pipeline/update_wizbucks.py (current balances)
- NEW: data_pipeline/track_wb_transactions.py
- NEW: data_pipeline/calculate_wb_installments.py


## ============================================================================
## 4. TRANSACTION LOG (transactions.json)
## ============================================================================

Purpose: Complete audit trail of all FBP actions
Update: Real-time as events occur
Size estimate: ~2-5 MB per season (hundreds of transactions)

Structure:
```json
[
  {
    "transaction_id": "txn_2025_001",
    "admin_datetime": "2025-02-10T19:45:32",
    "event": "PAD",  // Special event context
    
    // Player info
    "upid": "12345",
    "player_name": "Jackson Chourio",
    "mlb_team": "MIL",
    "position": "OF",
    "age": 20,
    "level": "AAA",
    "team_rank": 1,
    "rank": 23,
    "eta": "2024",
    
    // FBP info
    "player_type": "Farm",
    "owner": "WIZ",
    "contract_status": "Purchased Contract",
    "years": "PC",
    
    // Transaction details
    "update_type": "Purchase",  // From dropdown list
    "previous_owner": null,
    "new_owner": "WIZ",
    "wb_cost": 10,
    "notes": "Purchased at PAD"
  },
  {
    "transaction_id": "txn_2025_002",
    "admin_datetime": "2025-02-20T10:15:00",
    "event": "Trade",
    
    "update_type": "Trade",
    "players_involved": [
      {"upid": "111", "name": "Player A", "from": "WIZ", "to": "B2J"},
      {"upid": "222", "name": "Player B", "from": "B2J", "to": "WIZ"}
    ],
    "wizbucks_transferred": {
      "from": "WIZ",
      "to": "B2J",
      "amount": 15
    },
    "notes": "Pre-KAP trade"
  }
]
```

Update types (from screenshot):
- Admin
- Call Up Penalty
- DC
- Draft
- Drop
- Franchise
- Graduate
- Keeper
- PAD
- Purchase
- Roster
- Trade
- Auction
- Reset

Update scripts:
- NEW: log_transaction.py (helper function used by all scripts)
- Enhanced: All existing scripts to log transactions
- NEW: transaction_viewer.py (search/filter historical)


## ============================================================================
## 5. STANDINGS DATABASE (standings.json) - ENHANCED
## ============================================================================

Purpose: Current + historical standings
Update: Daily during season
Size estimate: ~100 KB per season

Structure:
```json
{
  "current_season": 2025,
  "current_week": 17,
  "last_updated": "2025-07-15T06:00:00",
  
  "standings": [
    {
      "rank": 1,
      "team": "WIZ",
      "record": "105-85-12",
      "win_pct": 0.549,
      "division": "Colossus of Clout",
      "division_rank": 1,
      "games_back": 0,
      "playoff_bracket": "Championship"
    }
    // ... all 12 teams
  ],
  
  "current_matchup": {
    "week": 17,
    "matchups": [
      {
        "team1": "WIZ",
        "team1_score": 7,
        "team2": "B2J",
        "team2_score": 5,
        "status": "In Progress"
      }
    ]
  },
  
  "history": {
    "2024": { /* previous season standings */ },
    "2023": { /* ... */ }
  }
}
```

Update scripts:
- data_pipeline/save_standings.py (enhanced)


## ============================================================================
## 6. ADDITIONAL DATA FILES NEEDED
## ============================================================================

### Draft System:
```
data/draft_picks.json        - Pick ownership tracker
data/draft_boards.json       - Personal draft boards (12 teams)
data/draft_results.json      - Historical draft results
data/draft_tax.json          - Tax brackets per team
```

### Keeper System:
```
data/keeper_salaries.json    - Current salaries per team
data/il_tags.json            - IL tag assignments
data/keeper_decisions.json   - Annual keeper deadline submissions
```

### Auction Portal:
```
data/auction_current.json    - Active week's bids
data/auction_history.json    - Historical auction results
data/auction_schedule.json   - Week-by-week auction calendar
```

### Compliance & Tracking:
```
data/30man_compliance.json   - Roster compliance tracker
data/service_time.json       - Service days tracking
data/player_photos.json      - Photo URLs with credits
```


## ============================================================================
## IMPLEMENTATION PRIORITY
## ============================================================================

### Phase 1: Enhanced Core Data (Week 1-2)
1. ✅ combined_players.json (DONE - needs MLB bio enhancement)
2. ⏳ player_stats.json (multi-season stats database)
3. ✅ wizbucks.json (DONE - needs installment tracking)
4. ⏳ transactions.json (new - critical for audit trail)

### Phase 2: Transaction System (Week 3)
5. Transaction logging infrastructure
6. Historical transaction import
7. Transaction search/filter API

### Phase 3: Financial System (Week 4)
8. WizBucks installment tracking
9. Keeper salary calculator
10. Draft tax calculator

### Phase 4: Competition & Drafts (Week 5)
11. Enhanced standings with history
12. Draft pick tracker
13. Draft board system

### Phase 5: Advanced Features (Week 6+)
14. Auction portal data
15. Service time tracking
16. 30-man compliance
17. Player photos


## ============================================================================
## STATS DATABASE FEASIBILITY ANALYSIS
## ============================================================================

Question: Can we store 2-3K players × 10-20 years of stats?

Answer: YES, with smart architecture

### Storage Calculation:
```
2,500 players × 15 years average × 2 KB per season = 75 MB
└─ Current season (hot): 5 MB
└─ Recent 3 years (warm): 15 MB  
└─ Historical (cold): 55 MB
```

### Recommended Structure:

```
data/stats/
├── current_2025.json           (5 MB - loaded by default)
├── recent_2024.json            (5 MB - lazy load)
├── recent_2023.json            (5 MB - lazy load)
├── recent_2022.json            (5 MB - lazy load)
└── historical/
    ├── seasons_2012-2015.json  (15 MB - archive)
    ├── seasons_2016-2019.json  (15 MB - archive)
    └── seasons_2020-2021.json  (10 MB - archive)
```

### Data Sources Integration:

**Current Season (2025):**
- Yahoo API: Basic MLB stats (daily)
- MLB Stats API: Detailed MLB + all MiLB levels (daily)
- MLB Prospect CSVs: Aggregate prospect stats (weekly)

**Historical (2012-2024):**
- Fangraphs CSVs: Advanced MLB stats (import once)
- Yahoo API historical: Basic stats (if available)
- MLB Stats API: Can fetch any past season

### Implementation Strategy:

```python
# stats_database.py structure
{
  "index": {
    "12345": {  // Quick UPID lookup
      "name": "Mike Trout",
      "seasons_available": [2012, 2013, ..., 2025],
      "current_season_file": "current_2025.json",
      "has_milb_data": false
    }
  },
  
  "stats_2025": {
    "12345": {
      "mlb": { /* current stats */ },
      "milb": null
    }
  }
}
```

**Discord bot usage:**
```python
# Fast current season lookup (5 MB loaded)
player_stats = stats_2025[upid]['mlb']['batting']

# Historical lookup (lazy load)
if year < 2023:
    historical_stats = load_historical_season(year)
    player_stats = historical_stats[upid]
```

**Website usage:**
```javascript
// Load current season by default
fetch('data/stats/current_2025.json')

// Load historical on demand
fetch(`data/stats/historical/seasons_${year}.json`)
```

### BUILD PROCESS:

**Step 1: Import Historical Fangraphs**
```bash
python3 import_fangraphs_csvs.py
# Input: Your vault of Fangraphs CSVs (2012-2024)
# Output: data/stats/historical/*.json
```

**Step 2: Update Current Season**
```bash
python3 update_current_stats.py
# Runs daily via GitHub Actions
# Updates: data/stats/current_2025.json
```

**Step 3: Merge Prospect Stats**
```bash
python3 merge_prospect_stats.py
# Weekly: Merges MLB CSV uploads
# Adds to: data/stats/current_2025.json
```


## ============================================================================
## TRANSACTION DATABASE STRUCTURE
## ============================================================================

Based on screenshot validation rules, here's the complete structure:

```json
[
  {
    "txn_id": "txn_2025_001",
    "admin_datetime": "2025-02-10T19:45:32.123",
    "season": 2025,
    
    // Player snapshot at time of transaction
    "player": {
      "upid": "12345",
      "name": "Jackson Chourio",
      "mlb_team": "MIL",
      "position": "OF",
      "age": 20,
      "level": "AAA",
      "team_rank": 1,
      "rank_adp": 23,
      "eta": "2024"
    },
    
    // FBP status
    "fbp_before": {
      "player_type": "Farm",
      "owner": null,  // Unowned
      "contract_status": "Uncontracted",
      "years": "UC"
    },
    
    "fbp_after": {
      "player_type": "Farm",
      "owner": "WIZ",
      "contract_status": "Purchased Contract",
      "years": "PC"
    },
    
    // Transaction details
    "update_type": "Purchase",  // From dropdown
    "event": "PAD",  // Special event context
    
    // Financial impact
    "wb_impact": {
      "team": "WIZ",
      "amount": -10,
      "period": "PAD",
      "balance_after": 90
    },
    
    // Metadata
    "submitted_by": "Zach",  // Discord user
    "processed_by": "bot",   // or "admin"
    "notes": "PAD prospect purchase"
  }
]
```

### Indexing for Fast Lookups:

```json
{
  "transactions": [ /* full list */ ],
  
  "indexes": {
    "by_upid": {
      "12345": [0, 5, 12, 45]  // Transaction indices
    },
    "by_team": {
      "WIZ": [0, 2, 8, 15]
    },
    "by_event": {
      "PAD": [0, 1, 2],
      "Trade": [10, 15, 20]
    },
    "by_date": {
      "2025-02": [0, 1, 2, 3]
    }
  }
}
```


## ============================================================================
## DATA SIZE ESTIMATES
## ============================================================================

Current Data:
✅ combined_players.json         1 MB   (2,500 players)
✅ mlb_id_cache.json             200 KB (2,745 IDs)
✅ wizbucks.json                 1 KB   (12 teams)
✅ standings.json                5 KB   (current)

New Data Needed:
⏳ player_stats.json (current)   5 MB   (2,500 players, 1 season)
⏳ player_stats (historical)     50 MB  (2,500 × 10 years)
⏳ transactions.json             2 MB   (per season)
⏳ All other files               5 MB   (drafts, auction, etc.)

Total: ~65 MB (well within GitHub limits)
GitHub Pages limit: 1 GB (you'll use ~6.5%)


## ============================================================================
## NEXT STEPS
## ============================================================================

Immediate (This Week):
1. Enhance combined_players.json with MLB bio data
2. Create player_stats.json for current season
3. Build transaction logging infrastructure
4. Create fbp_prospect_stats.json from CSVs

Next Week:
5. Import historical Fangraphs data
6. Build WizBucks installment tracker
7. Create transaction indexes

Following Weeks:
8. Draft system data
9. Auction portal data
10. Keeper salary calculator
