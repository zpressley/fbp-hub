#!/usr/bin/env python3
"""
Update prospect_tags.json with Status based on:
- Dropped: from player_logs of dropped players during the PAD (can be paired with other statuses)
- Debuted: from combined_players if debuted = true
- INT: for any player with international rankings (only if also FYPD, otherwise standard)
- FYPD: for any player on combined_players with fypd = True (mutually exclusive with standard)
- standard: for all players not dropped with no other qualifying tag
"""

import csv
import json
from datetime import datetime
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent
CSV_PATH = Path("/Users/zpressley/Downloads/Prospect Tags - simple (3).csv")
COMBINED_PLAYERS_PATH = BASE_DIR / "data" / "combined_players.json"
PLAYER_LOG_PATH = BASE_DIR / "data" / "player_log.json"
OUTPUT_PATH = BASE_DIR / "data" / "prospect_tags.json"

def load_combined_players():
    """Load combined_players.json and return a dict keyed by UPID."""
    with open(COMBINED_PLAYERS_PATH, 'r') as f:
        players = json.load(f)
    
    return {str(p.get('upid', '')): p for p in players if p.get('upid')}

def load_dropped_upids():
    """Load player_log.json and return set of UPIDs that were dropped during PAD."""
    with open(PLAYER_LOG_PATH, 'r') as f:
        logs = json.load(f)
    
    dropped_upids = set()
    for log in logs:
        # Check for PAD-related drops
        if log.get('update_type') == 'Drop' and ('PAD' in log.get('source', '') or 'PAD' in log.get('id', '')):
            upid = log.get('upid')
            if upid:
                dropped_upids.add(str(upid))
    
    return dropped_upids

def parse_csv():
    """Parse the CSV and return list of player dicts, keeping first occurrence for duplicates."""
    players = []
    seen_upids = set()
    
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            upid = row.get('UPID', '').strip()
            if upid and upid not in seen_upids:
                players.append(row)
                seen_upids.add(upid)
    
    return players

def has_int_ranking(row):
    """Check if player has any international rankings."""
    int_columns = ['2026 INT Top 10', '2025 INT Top 10', '2024 INT Top 10']
    for col in int_columns:
        val = row.get(col, '').strip()
        if val and val not in ['', '0']:
            return True
    return False

def has_fypd_ranking(row):
    """Check if player has any FYPD rankings in the CSV."""
    fypd_columns = ['2025 FYPD Top 20', '2024 FYPD Top 20']
    for col in fypd_columns:
        val = row.get(col, '').strip()
        if val and val not in ['', '0']:
            return True
    return False

def get_fv_value(row, year):
    """Get FV value for a given year."""
    val = row.get(f'{year} FV', '').strip()
    return val if val else None

def get_badges(row):
    """Extract badges from the CSV row."""
    badges = []
    
    # Ranked badges (numeric values)
    ranked_badge_columns = [
        ('2026 Top 100', '2026 Top 100'),
        ('2025 Top 100', '2025 Top 100'),
        ('2024 Top 100', '2024 Top 100'),
        # Removed 2026 Org Top 10 entirely
        ('2025 Org Top 10', '2025 Org Top 10'),
        ('2024 Org Top 10', '2024 Org Top 10'),
        ('2025 FYPD Top 20', '2025 FYPD Top 20'),
        ('2024 FYPD Top 20', '2024 FYPD Top 20'),
        ('2026 INT Top 10', '2026 INT Top 10'),
        ('2025 INT Top 10', '2025 INT Top 10'),
        ('2024 INT Top 10', '2024 INT Top 10'),
        ('2026 POS Top 10', '2026 POS Top 10'),
        ('2025 POS Top 10', '2025 POS Top 10'),
        ('2024 POS Top 10', '2024 POS Top 10'),
    ]
    
    for csv_col, badge_type in ranked_badge_columns:
        val = row.get(csv_col, '').strip()
        if val and val not in ['', '0']:
            try:
                rank = int(val)
                badges.append({
                    "type": badge_type,
                    "rank": rank
                })
            except ValueError:
                pass
    
    # Boolean badges (presence = has badge, no rank)
    boolean_badge_columns = [
        ('2025 MLB Futures', '2025 MLB Futures'),
        ('2024 MLB Futures', '2024 MLB Futures'),
    ]
    
    for csv_col, badge_type in boolean_badge_columns:
        val = row.get(csv_col, '').strip()
        if val and val not in ['', '0']:
            badges.append({
                "type": badge_type,
                "rank": 1  # Boolean badge, use 1 to indicate presence
            })
    
    return badges

def determine_status(upid, row, combined_players, dropped_upids):
    """
    Determine the status array for a player.
    
    Rules:
    - "dropped" - from player_logs for dropped players during PAD (can be paired with other statuses)
    - "debuted" - from combined_players if debuted = true
    - "int_signee" - only if also FYPD; otherwise int_signee alone becomes standard
    - "fypd" - for any player on combined_players with fypd = True (mutually exclusive with standard)
    - "standard" - for all players without fypd or debuted status
    """
    status = []
    
    # Check if dropped during PAD (can be paired with other statuses)
    is_dropped = str(upid) in dropped_upids
    if is_dropped:
        status.append("dropped")
    
    # Check if debuted (from combined_players)
    player_data = combined_players.get(str(upid), {})
    if player_data.get('debuted') is True:
        status.append("debuted")
    
    # Check if FYPD (from combined_players first, then CSV)
    is_fypd = False
    if player_data.get('fypd') is True:
        is_fypd = True
    elif has_fypd_ranking(row):
        is_fypd = True
    
    if is_fypd:
        status.append("fypd")
    
    # Check if has INT ranking (from CSV)
    # Only add int_signee if player also has FYPD; otherwise they become standard
    if has_int_ranking(row) and is_fypd:
        status.append("int_signee")
    
    # If no qualifying status (fypd or debuted), mark as standard
    # fypd and standard are mutually exclusive
    if "fypd" not in status and "debuted" not in status:
        status.append("standard")
    
    return status

def main():
    print("Loading combined_players.json...")
    combined_players = load_combined_players()
    print(f"  Loaded {len(combined_players)} players")
    
    print("Loading player_log.json for dropped players...")
    dropped_upids = load_dropped_upids()
    print(f"  Found {len(dropped_upids)} dropped UPIDs during PAD")
    
    print("Parsing CSV...")
    csv_players = parse_csv()
    print(f"  Parsed {len(csv_players)} players from CSV")
    
    print("Building prospect_tags.json...")
    output_players = []
    
    status_counts = {"dropped": 0, "debuted": 0, "int_signee": 0, "fypd": 0, "standard": 0}
    
    for row in csv_players:
        upid = row.get('UPID', '').strip()
        name = row.get('Player Name', '').strip()
        
        if not upid:
            continue
        
        # Get org and position from combined_players if available
        player_data = combined_players.get(str(upid), {})
        org = player_data.get('team', '')
        position = player_data.get('position', '')
        
        # Get badges
        badges = get_badges(row)
        
        # Determine status
        status = determine_status(upid, row, combined_players, dropped_upids)
        
        # Count statuses
        for s in status:
            if s in status_counts:
                status_counts[s] += 1
        
        # Determine FV values based on status
        # - INT players: keep 2026 FV only
        # - FYPD players: only show 2025 FV (not 2026)
        # - Others: no 2026 FV
        is_int_player = has_int_ranking(row)
        is_fypd_player = "fypd" in status
        
        fv_2024 = get_fv_value(row, '2024')
        fv_2025 = get_fv_value(row, '2025')
        fv_2026 = get_fv_value(row, '2026') if is_int_player else None
        
        # Build player object
        player_obj = {
            "upid": upid,
            "name": name,
            "org": org,
            "position": position,
            "fv": {
                "2024": fv_2024,
                "2025": fv_2025,
                "2026": fv_2026
            },
            "badges": badges,
            "status": status
        }
        
        output_players.append(player_obj)
    
    # Build final output
    output = {
        "generated": datetime.now().strftime("%Y-%m-%d"),
        "source": "Prospect Tags - simple.csv",
        "players": output_players
    }
    
    # Write output
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\nWrote {len(output_players)} players to {OUTPUT_PATH}")
    print("\nStatus counts:")
    for s, count in status_counts.items():
        print(f"  {s}: {count}")

if __name__ == "__main__":
    main()
