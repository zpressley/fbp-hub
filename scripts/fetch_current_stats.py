#!/usr/bin/env python3
"""
FBP Hub - Current Season Stats Collector
Fetches current MLB season stats for all owned players via the MLB Stats API,
then merges them into data/player_stats.json (preserving historical seasons).

Run daily via GitHub Actions to keep stats fresh.

Output format matches the existing player_stats.json array structure:
  - camelCase field names (atBats, homeRuns, etc.)
  - separate entries for batting / pitching
  - keyed by upid with level, season, stat_type, source
"""

import json
import os
import requests
from datetime import datetime

# Constants
COMBINED_PLAYERS = "data/combined_players.json"
OUTPUT_FILE = "data/player_stats.json"
CURRENT_SEASON = 2026


def load_owned_players():
    """Load all owned players from combined_players.json"""
    try:
        with open(COMBINED_PLAYERS, 'r') as f:
            players = json.load(f)

        owned = [p for p in players
                 if p.get('player_type') == 'MLB'
                 and (p.get('FBP_Team') or p.get('manager'))
                 and p.get('upid')]

        print(f"📊 Found {len(owned)} owned MLB players")
        return owned
    except FileNotFoundError:
        print(f"❌ Could not find {COMBINED_PLAYERS}")
        return []


def get_mlb_id_from_player(player):
    """Extract MLB Stats API ID from player data (mlb_id only)"""
    mlb_id = player.get('mlb_id')
    if mlb_id:
        return int(mlb_id)
    return None


def get_player_stats(mlb_id):
    """Fetch current season stats from MLB Stats API.
    Returns (batting_stats_dict | None, pitching_stats_dict | None).
    """
    url = f"https://statsapi.mlb.com/api/v1/people/{mlb_id}/stats"
    params = {
        'stats': 'season',
        'season': CURRENT_SEASON,
        'group': 'hitting,pitching',
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code != 200:
            return None, None

        data = response.json()
        batting = None
        pitching = None

        for stat_group in data.get('stats', []):
            group_name = stat_group.get('group', {}).get('displayName', '')

            for split in stat_group.get('splits', []):
                s = split.get('stat', {})

                if group_name == 'hitting':
                    batting = {
                        'games': s.get('gamesPlayed'),
                        'atBats': s.get('atBats', 0),
                        'runs': s.get('runs', 0),
                        'hits': s.get('hits', 0),
                        'doubles': s.get('doubles', 0),
                        'triples': s.get('triples', 0),
                        'homeRuns': s.get('homeRuns', 0),
                        'rbi': s.get('rbi', 0),
                        'stolenBases': s.get('stolenBases', 0),
                        'caughtStealing': s.get('caughtStealing', 0),
                        'baseOnBalls': s.get('baseOnBalls', 0),
                        'strikeOuts': s.get('strikeOuts', 0),
                        'totalBases': s.get('totalBases', 0),
                        'avg': s.get('avg'),
                        'obp': s.get('obp'),
                        'slg': s.get('slg'),
                        'ops': s.get('ops'),
                    }

                elif group_name == 'pitching':
                    pitching = {
                        'games': s.get('gamesPlayed'),
                        'gamesPlayed': s.get('gamesPlayed'),
                        'gamesStarted': s.get('gamesStarted', 0),
                        'inningsPitched': s.get('inningsPitched', 0),
                        'hits': s.get('hits', 0),
                        'runs': s.get('runs', 0),
                        'earnedRuns': s.get('earnedRuns', 0),
                        'baseOnBalls': s.get('baseOnBalls', 0),
                        'strikeOuts': s.get('strikeOuts', 0),
                        'homeRuns': s.get('homeRuns', 0),
                        'era': s.get('era'),
                        'whip': s.get('whip'),
                        'wins': s.get('wins', 0),
                        'losses': s.get('losses', 0),
                        'saves': s.get('saves', 0),
                        'holds': s.get('holds', 0),
                        'blownSaves': s.get('blownSaves', 0),
                    }

        return batting, pitching

    except Exception as e:
        print(f"⚠️ Error fetching stats for MLB ID {mlb_id}: {e}")
        return None, None


def fetch_all_stats():
    """Fetch stats for all owned players.
    Returns a list of entry dicts matching the player_stats.json schema.
    """
    players = load_owned_players()
    if not players:
        return []

    entries = []
    updated_count = 0
    skipped_count = 0

    print(f"\n🔄 Fetching {CURRENT_SEASON} season stats...")

    for i, player in enumerate(players, 1):
        upid = str(player.get('upid', ''))
        name = player.get('name', 'Unknown')

        if not upid:
            skipped_count += 1
            continue

        mlb_id = get_mlb_id_from_player(player)
        if not mlb_id:
            skipped_count += 1
            continue

        if i % 25 == 0:
            print(f"  📈 Progress: {i}/{len(players)}")

        batting, pitching = get_player_stats(mlb_id)

        base = {
            'upid': upid,
            'player_name': name,
            'season': CURRENT_SEASON,
            'mlb_team': player.get('team', ''),
            'mlb_id': mlb_id,
            'fbp_name': name,
            'fbp_manager': player.get('manager', ''),
            'fbp_contract': player.get('years_simple', ''),
            'fbp_player_type': player.get('player_type', 'MLB'),
            'position': player.get('position', ''),
            'level': 'MLB',
            'source': 'mlb_stats_api',
        }

        if batting:
            entries.append({**base, 'stat_type': 'batting', **batting})
            updated_count += 1

        if pitching:
            entries.append({**base, 'stat_type': 'pitching', **pitching})
            updated_count += 1

    print(f"\n✅ Created {updated_count} stat entries for {len(players)} players")
    if skipped_count > 0:
        print(f"⚠️ Skipped {skipped_count} players (no mlb_id)")
    return entries


def merge_and_save(new_entries):
    """Merge new entries into existing player_stats.json, replacing any
    entries for CURRENT_SEASON while preserving all other seasons."""

    existing = []
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r') as f:
                existing = json.load(f)
            print(f"📂 Loaded {len(existing)} existing entries")
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️ Could not read existing file, starting fresh: {e}")

    # Remove current-season entries from existing data
    kept = [e for e in existing if e.get('season') != CURRENT_SEASON]
    removed = len(existing) - len(kept)
    if removed:
        print(f"🗑️ Removed {removed} stale {CURRENT_SEASON} entries")

    merged = kept + new_entries
    print(f"📊 Total entries after merge: {len(merged)}")

    os.makedirs('data', exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(merged, f, indent=2)

    print(f"💾 Saved to {OUTPUT_FILE}")


def main():
    print("🚀 FBP Hub - Current Season Stats Collector")
    print("=" * 60)

    entries = fetch_all_stats()

    if entries:
        merge_and_save(entries)
        print(f"\n🎉 Stats collection complete!")
    else:
        print(f"\n⚠️ No stats collected")


if __name__ == "__main__":
    main()
