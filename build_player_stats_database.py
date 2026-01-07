#!/usr/bin/env python3
"""
Build player_stats.json - Multi-season stats database
Phase 1: Current season (2025) from MLB prospect CSVs
"""

import json
import os
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# Config
BATTER_CSV = "mlb_prospect_batstats_2025.csv"
PITCHER_CSV = "mlb_prospect_pitchstats_2025.csv"
FBP_SHEET_KEY = "13oEFhmmVF82qMnX0NV_W0szmfGjZySNaOALg3MhoRzA"
PLAYER_TAB = "Player Data"
CACHE_FILE = "data/mlb_id_cache.json"
OUTPUT_FILE = "data/player_stats_2025.json"

def load_data():
    """Load all necessary data"""
    print("📊 Loading data sources...\n")
    
    # MLB ID cache
    with open(CACHE_FILE, 'r') as f:
        cache = json.load(f)
    print(f"   ✅ MLB ID cache: {len(cache)} entries")
    
    # Create reverse lookup: MLB ID → UPID
    mlb_to_upid = {v['mlb_id']: upid for upid, v in cache.items()}
    
    # MLB prospect stats
    df_bat = pd.read_csv(BATTER_CSV)
    df_pitch = pd.read_csv(PITCHER_CSV)
    print(f"   ✅ MLB prospect batters: {len(df_bat)}")
    print(f"   ✅ MLB prospect pitchers: {len(df_pitch)}")
    
    # FBP data
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name("google_creds.json", scope)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(FBP_SHEET_KEY).worksheet(PLAYER_TAB)
    all_data = sheet.get_all_values()
    headers = all_data[0]
    
    # Build UPID → FBP data lookup
    upid_data = {}
    for row in all_data[1:]:
        if len(row) > 0:
            upid = str(row[0]).strip()
            if upid:
                upid_data[upid] = {
                    'name': row[1].strip() if len(row) > 1 else "",
                    'manager': row[headers.index("Manager")].strip() if "Manager" in headers and len(row) > headers.index("Manager") else "",
                    'contract': row[headers.index("Contract Type")].strip() if "Contract Type" in headers and len(row) > headers.index("Contract Type") else ""
                }
    
    print(f"   ✅ FBP data: {len(upid_data)} UPIDs\n")
    
    return mlb_to_upid, df_bat, df_pitch, upid_data

def build_stats_database():
    """Build the stats database"""
    print("🚀 Building Player Stats Database (2025 Season)")
    print("="*70 + "\n")
    
    mlb_to_upid, df_bat, df_pitch, upid_data = load_data()
    
    stats_db = {
        "season": 2025,
        "last_updated": pd.Timestamp.now().isoformat(),
        "stats_by_upid": {},
        "stats_by_mlb_id": {}
    }
    
    matched = 0
    no_upid = 0
    
    print("🎯 Processing batter stats...")
    for _, row in df_bat.iterrows():
        mlb_id = int(row['playerId'])
        upid = mlb_to_upid.get(mlb_id)
        
        if not upid:
            no_upid += 1
            continue
        
        fbp_info = upid_data.get(upid, {})
        
        stats_record = {
            "upid": upid,
            "mlb_id": mlb_id,
            "name": row['full_name'],
            "fbp_name": fbp_info.get('name', row['full_name']),
            "fbp_manager": fbp_info.get('manager', ""),
            "fbp_contract": fbp_info.get('contract', ""),
            
            "season": 2025,
            "player_type": "batter",
            
            "stats": {
                "games": int(row.get('atBats', 0) / 3.8) if row.get('atBats', 0) > 0 else 0,  # Estimate
                "atBats": int(row['atBats']),
                "runs": int(row['runs']),
                "hits": int(row['hits']),
                "doubles": int(row['doubles']),
                "triples": int(row['triples']),
                "homeRuns": int(row['homeRuns']),
                "rbi": int(row['rbi']),
                "stolenBases": int(row['stolenBases']),
                "caughtStealing": int(row['caughtStealing']),
                "baseOnBalls": int(row['baseOnBalls']),
                "strikeOuts": int(row['strikeOuts']),
                "avg": float(row['avg']),
                "obp": float(row['obp']),
                "slg": float(row['slg']),
                "ops": float(row['ops']),
                "totalBases": int(row['totalBases']),
                "leftOnBase": int(row['leftOnBase'])
            },
            
            "rank": int(row['rank']),
            "team": row['team'],
            "age": int(row['age']),
            "source": "mlb_prospect_csv_2025"
        }
        
        stats_db["stats_by_upid"][upid] = stats_record
        stats_db["stats_by_mlb_id"][str(mlb_id)] = stats_record
        matched += 1
        
        if matched <= 5:
            print(f"   ✅ {row['full_name']:<30} UPID: {upid}")
    
    print(f"\n🎯 Processing pitcher stats...")
    pitcher_matched = 0
    for _, row in df_pitch.iterrows():
        mlb_id = int(row['playerId'])
        upid = mlb_to_upid.get(mlb_id)
        
        if not upid:
            continue
        
        # Skip if already added as batter (two-way players)
        if upid in stats_db["stats_by_upid"]:
            continue
        
        fbp_info = upid_data.get(upid, {})
        
        stats_record = {
            "upid": upid,
            "mlb_id": mlb_id,
            "name": row['full_name'],
            "fbp_name": fbp_info.get('name', row['full_name']),
            "fbp_manager": fbp_info.get('manager', ""),
            "fbp_contract": fbp_info.get('contract', ""),
            
            "season": 2025,
            "player_type": "pitcher",
            
            "stats": {
                "gamesPitched": int(row['gamesPitched']),
                "gamesStarted": int(row['gamesStarted']) if pd.notna(row.get('gamesStarted')) else 0,
                "inningsPitched": float(row['inningsPitched']),
                "hits": int(row['hits']),
                "runs": int(row['runs']),
                "earnedRuns": int(row['earnedRuns']),
                "baseOnBalls": int(row['baseOnBalls']),
                "strikeOuts": int(row['strikeOuts']),
                "homeRuns": int(row['homeRuns']),
                "era": float(row['era']),
                "whip": float(row['whip']),
                "wins": int(row['wins']) if pd.notna(row.get('wins')) else 0,
                "losses": int(row['losses']) if pd.notna(row.get('losses')) else 0,
                "saves": int(row['saves']) if pd.notna(row.get('saves')) else 0,
                "holds": int(row['holds']) if pd.notna(row.get('holds')) else 0,
                "blownSaves": int(row['blownSaves']) if pd.notna(row.get('blownSaves')) else 0,
                "battersFaced": int(row['battersFaced']) if pd.notna(row.get('battersFaced')) else 0
            },
            
            "rank": int(row['rank']),
            "team": row['team'],
            "age": int(row['age']),
            "source": "mlb_prospect_csv_2025"
        }
        
        stats_db["stats_by_upid"][upid] = stats_record
        stats_db["stats_by_mlb_id"][str(mlb_id)] = stats_record
        pitcher_matched += 1
        
        if pitcher_matched <= 5:
            print(f"   ✅ {row['full_name']:<30} UPID: {upid}")
    
    # Save
    os.makedirs("data/stats", exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(stats_db, f, indent=2)
    
    file_size = os.path.getsize(OUTPUT_FILE)
    
    print("\n" + "="*70)
    print("✅ Player Stats Database Created!")
    print("="*70)
    print(f"\n📄 {OUTPUT_FILE}")
    print(f"   Size: {file_size/1024:.1f} KB")
    print(f"   Total prospects: {matched + pitcher_matched}")
    print(f"   ├─ Batters: {matched}")
    print(f"   └─ Pitchers: {pitcher_matched}")
    print(f"   MLB prospects without UPID: {no_upid}")
    
    print(f"\n🎯 Usage Examples:")
    print(f"\n   Discord Bot:")
    print(f"   ```python")
    print(f"   with open('data/player_stats_2025.json', 'r') as f:")
    print(f"       stats = json.load(f)")
    print(f"   ")
    print(f"   # Lookup by UPID")
    print(f"   player = stats['stats_by_upid']['12345']")
    print(f"   print(f\"{{player['name']}}: {{player['stats']['homeRuns']}} HR\")")
    print(f"   ```")
    
    print(f"\n   Website:")
    print(f"   ```javascript")
    print(f"   fetch('data/player_stats_2025.json')")
    print(f"     .then(r => r.json())")
    print(f"     .then(db => {{")
    print(f"       const player = db.stats_by_upid['12345'];")
    print(f"       displayStats(player);")
    print(f"     }});")
    print(f"   ```")
    
    print(f"\n🚀 Next: python3 enhance_combined_players_bio.py")

if __name__ == "__main__":
    build_stats_database()
