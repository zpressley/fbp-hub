#!/usr/bin/env python3
"""
Build prospect_tags.json from the Prospect Tags CSV database.
This creates the data file used by draft-preview.js for the prospect draft tab.
"""

import csv
import json
import os
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
HUB_ROOT = SCRIPT_DIR.parent
CSV_PATH = Path('/Users/zpressley/fbp-trade-bot/data/historical/2026/Prospect Tags - Database.csv')
OUTPUT_PATH = HUB_ROOT / 'data' / 'prospect_tags.json'
PLAYER_LOG_PATH = HUB_ROOT / 'data' / 'player_log.json'
COMBINED_PLAYERS_PATH = HUB_ROOT / 'data' / 'combined_players.json'


def parse_int_or_none(val):
    """Parse integer from string, return None if empty/invalid."""
    if not val or val.strip() == '':
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def parse_fv(val):
    """Parse FV value, handling '+' suffix (e.g., '45+' -> 45)."""
    if not val or val.strip() == '':
        return None
    # Remove '+' suffix if present
    clean = val.strip().rstrip('+')
    try:
        return int(float(clean))
    except (ValueError, TypeError):
        return None


def get_dropped_upids():
    """Parse player_log.json to find players dropped in PAD."""
    dropped = set()
    if not PLAYER_LOG_PATH.exists():
        return dropped
    
    try:
        with open(PLAYER_LOG_PATH, 'r') as f:
            logs = json.load(f)
        
        for entry in logs:
            # Look for PAD drops
            update_type = entry.get('update_type', '').lower()
            event = entry.get('event', '').lower()
            
            if 'drop' in update_type or 'drop' in event:
                if 'pad' in update_type or 'pad' in event or entry.get('source', '').lower() == 'pad':
                    upid = entry.get('upid')
                    if upid:
                        dropped.add(str(upid))
    except Exception as e:
        print(f"Warning: Could not parse player_log.json: {e}")
    
    return dropped


def build_badges(row):
    """Build badges array from CSV row."""
    badges = []
    
    # Top 100 badges
    if parse_int_or_none(row.get('2024 Top 100')):
        badges.append({'type': '2024 Top 100', 'rank': parse_int_or_none(row['2024 Top 100'])})
    if parse_int_or_none(row.get('2025 Preseason Top 100')):
        badges.append({'type': '2025 Top 100', 'rank': parse_int_or_none(row['2025 Preseason Top 100'])})
    if parse_int_or_none(row.get('2025 Post-Season Top 100')):
        # Use post-season rank if different/better
        existing = next((b for b in badges if b['type'] == '2025 Top 100'), None)
        post_rank = parse_int_or_none(row['2025 Post-Season Top 100'])
        if existing:
            # Keep the better (lower) rank
            if post_rank and post_rank < existing['rank']:
                existing['rank'] = post_rank
        else:
            badges.append({'type': '2025 Top 100', 'rank': post_rank})
    if parse_int_or_none(row.get('2026 Preseason Top 100')):
        badges.append({'type': '2026 Top 100', 'rank': parse_int_or_none(row['2026 Preseason Top 100'])})
    
    # Org Top 10 badges (FG Team RK <= 10)
    for year in ['2024', '2025', '2026']:
        col = f'{year} FG Team RK'
        rank = parse_int_or_none(row.get(col))
        if rank and rank <= 10:
            badges.append({'type': f'{year} Org Top 10', 'rank': rank})
    
    # FYPD Top 20 badges
    for year in ['2024', '2025']:
        col = f'{year} FYPD Rankings'
        rank = parse_int_or_none(row.get(col))
        if rank and rank <= 20:
            badges.append({'type': f'{year} FYPD Top 20', 'rank': rank})
    
    # INT Top 10 badges (International Signings rank <= 10)
    for year in ['2025', '2026']:
        col = f'{year} International Signings'
        rank = parse_int_or_none(row.get(col))
        if rank and rank <= 10:
            badges.append({'type': f'{year} INT Top 10', 'rank': rank})
    
    # 2024 INT - check if they have 2024 INTL Sign FV (implies int signee)
    # For INT Top 10, we'd need a ranking column - skip 2024 if no rank column
    
    # POS Top 10 badges
    for year in ['2024', '2025', '2026']:
        col = f'{year} Top 10 Positions'
        rank = parse_int_or_none(row.get(col))
        if rank and rank <= 10:
            badges.append({'type': f'{year} POS Top 10', 'rank': rank})
    
    # MLB Futures badges
    if row.get('2024 Futures Game', '').strip():
        badges.append({'type': '2024 MLB Futures', 'rank': None})
    if row.get('2025 Futures Game', '').strip():
        badges.append({'type': '2025 MLB Futures', 'rank': None})
    
    return badges


def get_fv_values(row):
    """Get FV values for each year."""
    fv = {'2024': None, '2025': None, '2026': None}
    
    # 2026 FV - only from INTL Sign FV (per user instruction)
    fv_2026 = parse_fv(row.get('2026 INTL Sign FV'))
    if fv_2026:
        fv['2026'] = fv_2026
    
    # 2025 FV - check FYPD FV first, then INTL Sign FV
    fv_2025 = parse_fv(row.get('2025 FYPD FV'))
    if not fv_2025:
        fv_2025 = parse_fv(row.get('2025 INTL Sign FV'))
    if fv_2025:
        fv['2025'] = fv_2025
    
    # 2024 FV - check FYPD FV first, then INTL Sign FV
    fv_2024 = parse_fv(row.get('2024 FYPD FV'))
    if not fv_2024:
        fv_2024 = parse_fv(row.get('2024 INTL Sign FV'))
    if fv_2024:
        fv['2024'] = fv_2024
    
    return fv


def get_debuted_upids():
    """Load combined_players.json and get UPIDs of debuted players."""
    debuted = set()
    if not COMBINED_PLAYERS_PATH.exists():
        return debuted
    
    try:
        with open(COMBINED_PLAYERS_PATH, 'r') as f:
            players = json.load(f)
        
        for p in players:
            if p.get('debuted') == True:
                upid = p.get('upid')
                if upid:
                    debuted.add(str(upid))
    except Exception as e:
        print(f"Warning: Could not parse combined_players.json: {e}")
    
    return debuted


def determine_status(row, dropped_upids, debuted_upids):
    """Determine player status as array of tags (can have multiple)."""
    upid = str(row.get('upid', ''))
    status_tags = []
    
    # FYPD
    if row.get('fypd', '').upper() == 'TRUE':
        status_tags.append('fypd')
    
    # Int signee - has any INTL Sign FV value or International Signings rank
    for col in ['2024 INTL Sign FV', '2025 INTL Sign FV', '2026 INTL Sign FV',
                '2025 International Signings', '2026 International Signings']:
        if row.get(col, '').strip():
            status_tags.append('int_signee')
            break
    
    # Debuted - check combined_players.json first, then CSV
    if upid in debuted_upids or row.get('debut?', '').upper() == 'TRUE':
        status_tags.append('debuted')
    
    # Dropped (from player_log PAD drops)
    if upid in dropped_upids:
        status_tags.append('dropped')
    
    return status_tags


def main():
    if not CSV_PATH.exists():
        print(f"Error: CSV not found at {CSV_PATH}")
        return
    
    # Get dropped players from player_log
    dropped_upids = get_dropped_upids()
    print(f"Found {len(dropped_upids)} dropped players in player_log.json")
    
    # Get debuted players from combined_players.json
    debuted_upids = get_debuted_upids()
    print(f"Found {len(debuted_upids)} debuted players in combined_players.json")
    
    players = []
    
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            upid = row.get('upid', '').strip()
            if not upid:
                continue
            
            player = {
                'upid': upid,
                'rank': parse_int_or_none(row.get('rank')),
                'name': row.get('name', '').strip(),
                'org': row.get('team', '').strip(),  # MLB team
                'position': row.get('position', '').strip(),
                'age': parse_int_or_none(row.get('age')),
                'fv': get_fv_values(row),
                'badges': build_badges(row),
                'status': determine_status(row, dropped_upids, debuted_upids),
                'fbp_team': row.get('FBP_Team', '').strip() or None
            }
            
            players.append(player)
    
    # Sort by rank
    players.sort(key=lambda p: p['rank'] if p['rank'] else 9999)
    
    output = {
        'generated': '2026-02-06',
        'source': 'Prospect Tags - Database.csv',
        'players': players
    }
    
    # Ensure output directory exists
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Generated {OUTPUT_PATH}")
    print(f"   {len(players)} players")
    
    # Stats
    badge_counts = {}
    for p in players:
        for b in p['badges']:
            badge_counts[b['type']] = badge_counts.get(b['type'], 0) + 1
    
    print("\nBadge counts:")
    for badge_type, count in sorted(badge_counts.items()):
        print(f"   {badge_type}: {count}")
    
    status_counts = {'fypd': 0, 'int_signee': 0, 'debuted': 0, 'dropped': 0}
    for p in players:
        for tag in p['status']:
            if tag in status_counts:
                status_counts[tag] += 1
    
    print("\nStatus counts:")
    for status, count in status_counts.items():
        print(f"   {status}: {count}")
    
    # Show overlap examples
    overlaps = [p for p in players if len(p['status']) > 1]
    print(f"\nPlayers with multiple statuses: {len(overlaps)}")
    if overlaps[:3]:
        for p in overlaps[:3]:
            print(f"   {p['name']}: {p['status']}")


if __name__ == '__main__':
    main()
