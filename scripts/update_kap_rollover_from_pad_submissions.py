#!/usr/bin/env python3
"""Update kap_rollover_2026 in config/managers.json from PAD submissions.

Usage (from repo root):

    python3 scripts/update_kap_rollover_from_pad_submissions.py

This expects a JSON file at data/pad_submissions.json with the same shape
as the localStorage object `pad_submissions_2026` written by js/pad.js:

{
  "TEAM_ABBR": {
    "team": "TEAM_ABBR",
    "timestamp": "2026-01-01T00:00:00Z",
    "spending": {
      "total": 120,
      "remaining": 20,
      "rollover": 25
    },
    ...
  },
  ...
}

For each team key found in both pad_submissions.json and config/managers.json,
this script will set `kap_rollover_2026` to the corresponding `spending.rollover`
value (clamped between 0 and 30, per constitution).
"""

import json
import pathlib
import sys
from typing import Any, Dict

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAD_SUBMISSIONS_PATH = ROOT / "data" / "pad_submissions.json"
MANAGERS_PATH = ROOT / "config" / "managers.json"


def load_json(path: pathlib.Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: {path} not found.", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse {path}: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    pad_data = load_json(PAD_SUBMISSIONS_PATH)
    managers = load_json(MANAGERS_PATH)

    if not isinstance(pad_data, dict):
        print("ERROR: data/pad_submissions.json must be an object keyed by team abbreviation.", file=sys.stderr)
        sys.exit(1)

    teams: Dict[str, Dict[str, Any]] = managers.get("teams") or {}
    if not isinstance(teams, dict):
        print("ERROR: config/managers.json missing 'teams' object.", file=sys.stderr)
        sys.exit(1)

    updated = 0
    for team_abbr, team_cfg in teams.items():
        if not isinstance(team_cfg, dict):
            continue
        submission = pad_data.get(team_abbr)
        if not isinstance(submission, dict):
            continue

        spending = submission.get("spending") or {}
        rollover = spending.get("rollover", 0)
        try:
            rollover_val = float(rollover)
        except (TypeError, ValueError):
            rollover_val = 0.0

        # League rule: only unused PAD allotment can roll to KAP, max $30
        rollover_val = max(0.0, min(30.0, rollover_val))

        # Write as int when possible to keep JSON tidy
        if rollover_val.is_integer():
            rollover_val = int(rollover_val)

        prev = team_cfg.get("kap_rollover_2026")
        team_cfg["kap_rollover_2026"] = rollover_val
        updated += 1
        print(f"Team {team_abbr}: kap_rollover_2026 {prev!r} -> {rollover_val!r}")

    managers["teams"] = teams

    with MANAGERS_PATH.open("w", encoding="utf-8") as f:
        json.dump(managers, f, indent=2)
        f.write("\n")

    print(f"\nUpdated kap_rollover_2026 for {updated} team(s) in {MANAGERS_PATH}.")


if __name__ == "__main__":
    main()
