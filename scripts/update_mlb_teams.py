#!/usr/bin/env python3
"""
Update MLB team affiliations in combined_players.json

Sources:
  1. Fresh Yahoo Fantasy 2026 player data (pulled via fetch_yahoo_all_players.py)
  2. MLB Stats API current team data (batched people endpoint)

Uses data/mlb_team_map.json to normalize all team abbreviations.

Usage:
  python3 scripts/update_mlb_teams.py                  # Dry-run: show diff only
  python3 scripts/update_mlb_teams.py --apply           # Apply changes to combined_players.json
  python3 scripts/update_mlb_teams.py --skip-mlb-api    # Skip MLB API (Yahoo only)
"""

import json
import math
import sys
import time
from copy import deepcopy
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
COMBINED_PATH = ROOT / "data" / "combined_players.json"
TEAM_MAP_PATH = ROOT / "data" / "mlb_team_map.json"

# Yahoo data pulled from fbp-trade-bot
YAHOO_DATA_PATH = Path.home() / "fbp-trade-bot" / "data" / "yahoo_all_players_2026.json"

MLB_API_BASE = "https://statsapi.mlb.com/api/v1/people"
BATCH_SIZE = 100


# ── helpers ──────────────────────────────────────────────────────────────────

def load_team_map():
    """Build a normalizer: any known alias/abbreviation → canonical abbreviation."""
    raw = json.loads(TEAM_MAP_PATH.read_text())
    alias_map = {}

    # official section: key is canonical, aliases are alternates
    for canonical, info in raw.get("official", {}).items():
        alias_map[canonical.lower()] = canonical
        for alias in info.get("aliases", []):
            alias_map[alias.lower()] = canonical

    # flat aliases section
    for alias, canonical in raw.get("aliases", {}).items():
        alias_map[alias.lower()] = canonical

    return alias_map


def normalize_team(raw_team, alias_map):
    """Return the canonical abbreviation for a team string, or None."""
    if not raw_team or raw_team.strip() == "":
        return None
    key = raw_team.strip().lower()
    return alias_map.get(key)


def load_yahoo_players():
    """Load fresh Yahoo 2026 data and index by yahoo_player_id."""
    if not YAHOO_DATA_PATH.exists():
        print(f"⚠️  Yahoo data not found at {YAHOO_DATA_PATH}")
        print("   Run: cd ~/fbp-trade-bot && python3 data_pipeline/fetch_yahoo_all_players.py full 5000 2026")
        return {}
    players = json.loads(YAHOO_DATA_PATH.read_text())
    print(f"📥 Loaded {len(players)} players from Yahoo 2026 data")
    by_id = {}
    for p in players:
        pid = p.get("player_id")
        if pid:
            by_id[pid] = p
    return by_id


def fetch_mlb_api_teams(mlb_ids):
    """Batch-fetch current team from MLB Stats API for a list of mlb_ids.
    Returns dict: mlb_id (int) → team full name string."""
    results = {}
    num_batches = math.ceil(len(mlb_ids) / BATCH_SIZE) or 1
    for i in range(num_batches):
        batch = mlb_ids[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        if not batch:
            continue
        ids_str = ",".join(str(x) for x in batch)
        url = f"{MLB_API_BASE}?personIds={ids_str}&hydrate=currentTeam"
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            for person in resp.json().get("people", []):
                pid = person["id"]
                team_obj = person.get("currentTeam", {})
                team_name = team_obj.get("name", "")
                if team_name:
                    results[pid] = team_name
        except Exception as e:
            print(f"  ⚠️  MLB API batch {i+1} error: {e}")
        if i < num_batches - 1:
            time.sleep(0.25)
        if (i + 1) % 10 == 0:
            print(f"  📡 MLB API: {i+1}/{num_batches} batches...")
    return results


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    apply_changes = "--apply" in sys.argv
    skip_mlb = "--skip-mlb-api" in sys.argv

    alias_map = load_team_map()
    players = json.loads(COMBINED_PATH.read_text())
    print(f"📂 Loaded {len(players)} players from combined_players.json")

    # ── Yahoo source ─────────────────────────────────────────────────────
    yahoo_by_id = load_yahoo_players()

    # ── MLB API source ───────────────────────────────────────────────────
    mlb_team_by_id = {}
    if not skip_mlb:
        mlb_ids = sorted(
            {int(p["mlb_id"]) for p in players if p.get("mlb_id")}
        )
        print(f"📡 Fetching current teams from MLB API for {len(mlb_ids)} players...")
        mlb_team_by_id = fetch_mlb_api_teams(mlb_ids)
        print(f"   Got team data for {len(mlb_team_by_id)} players")

    # ── Build diff ───────────────────────────────────────────────────────
    changes = []  # list of (player, old_team, new_team, source)

    for p in players:
        old_team = p.get("team", "")
        new_team = None
        source = None

        # Priority 1: Yahoo (most reliable for current affiliations)
        yahoo_id = p.get("yahoo_id")
        if yahoo_id and str(yahoo_id) in yahoo_by_id:
            yp = yahoo_by_id[str(yahoo_id)]
            raw = yp.get("team") or yp.get("team_full") or ""
            normalized = normalize_team(raw, alias_map)
            if normalized:
                new_team = normalized
                source = "yahoo"

        # Priority 2: MLB API (fills gaps for players without yahoo_id)
        mlb_id = p.get("mlb_id")
        if new_team is None and mlb_id and int(mlb_id) in mlb_team_by_id:
            raw = mlb_team_by_id[int(mlb_id)]
            normalized = normalize_team(raw, alias_map)
            if normalized:
                new_team = normalized
                source = "mlb_api"

        # Only record if there's actually a change
        if new_team and new_team != old_team:
            changes.append((p, old_team, new_team, source))

    # ── Report ───────────────────────────────────────────────────────────
    if not changes:
        print("\n✅ No team changes detected.")
        return

    print(f"\n{'='*70}")
    print(f"  {len(changes)} TEAM CHANGES DETECTED")
    print(f"{'='*70}\n")

    # Group by source
    yahoo_changes = [c for c in changes if c[3] == "yahoo"]
    mlb_changes = [c for c in changes if c[3] == "mlb_api"]

    if yahoo_changes:
        print(f"📊 From Yahoo ({len(yahoo_changes)} changes):")
        print(f"  {'Player':<30} {'Old':<6} {'New':<6} {'UPID':<8} {'Type':<6}")
        print(f"  {'-'*60}")
        for p, old, new, _ in sorted(yahoo_changes, key=lambda x: x[0].get("name", "")):
            name = p.get("name", "???")[:29]
            upid = p.get("upid", "")
            ptype = p.get("player_type", "")
            print(f"  {name:<30} {old or 'N/A':<6} {new:<6} {upid:<8} {ptype:<6}")

    if mlb_changes:
        print(f"\n📡 From MLB API ({len(mlb_changes)} changes):")
        print(f"  {'Player':<30} {'Old':<6} {'New':<6} {'UPID':<8} {'Type':<6}")
        print(f"  {'-'*60}")
        for p, old, new, _ in sorted(mlb_changes, key=lambda x: x[0].get("name", "")):
            name = p.get("name", "???")[:29]
            upid = p.get("upid", "")
            ptype = p.get("player_type", "")
            print(f"  {name:<30} {old or 'N/A':<6} {new:<6} {upid:<8} {ptype:<6}")

    # ── Apply ────────────────────────────────────────────────────────────
    if not apply_changes:
        print(f"\n💡 Dry run — pass --apply to write changes to combined_players.json")
        return

    print(f"\n✏️  Applying {len(changes)} team updates...")
    updated = deepcopy(players)
    change_map = {id(p): new for p, _, new, _ in changes}

    for i, p in enumerate(players):
        if id(p) in change_map:
            updated[i]["team"] = change_map[id(p)]

    COMBINED_PATH.write_text(json.dumps(updated, indent=2))
    print(f"✅ Wrote {len(updated)} players to {COMBINED_PATH}")
    print(f"   ({len(changes)} teams updated)")


if __name__ == "__main__":
    main()
