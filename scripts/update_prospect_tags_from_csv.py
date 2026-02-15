#!/usr/bin/env python3

import argparse
import csv
import json
from typing import Any, Dict, Optional, Tuple


def _parse_fv(raw: str) -> Optional[float | int]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in {"null", "none", "na", "n/a", "-"}:
        return None

    # Be tolerant (older exports had values like "45+")
    s = s.replace("+", "").strip()

    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return None


def _row_int_flag(u: str, v: str, w: str) -> bool:
    return bool((u or "").strip() or (v or "").strip() or (w or "").strip())


def _load_csv_map(csv_path: str) -> Dict[str, Tuple[Optional[float | int], Optional[float | int], Optional[float | int], bool]]:
    """Return map: upid -> (fv2026, fv2025, fv2024, is_int)."""

    mapping: Dict[str, Tuple[Optional[float | int], Optional[float | int], Optional[float | int], bool]] = {}

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        r = csv.reader(f)
        header = next(r)

        # User-provided fixed column mapping:
        # col 1 (A): UPID
        # col 3 (C): 2026 FV
        # col 4 (D): 2025 FV
        # col 5 (E): 2024 FV
        # col 21/22/23 (U/V/W): International Signings
        def get(row, idx):
            return row[idx] if idx < len(row) else ""

        for row in r:
            upid = str(get(row, 0)).strip()
            if not upid:
                continue

            fv2026 = _parse_fv(get(row, 2))
            fv2025 = _parse_fv(get(row, 3))
            fv2024 = _parse_fv(get(row, 4))

            is_int = _row_int_flag(get(row, 20), get(row, 21), get(row, 22))

            mapping[upid] = (fv2026, fv2025, fv2024, is_int)

    return mapping


def _coerce_status_list(status_val: Any) -> list[str]:
    if status_val is None:
        return []
    if isinstance(status_val, list):
        return [str(s) for s in status_val if s is not None and str(s).strip()]
    # If someone stored status as a string, coerce it into a single-element list
    if isinstance(status_val, str) and status_val.strip():
        return [status_val.strip()]
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Update prospect_tags.json FV values and INT status from a CSV export.")
    parser.add_argument("--csv", required=True, help="Path to Prospect Tags CSV")
    parser.add_argument("--json", required=True, help="Path to prospect_tags.json")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes but do not write")

    args = parser.parse_args()

    csv_map = _load_csv_map(args.csv)

    with open(args.json, "r", encoding="utf-8") as f:
        doc = json.load(f)

    if isinstance(doc, dict) and isinstance(doc.get("players"), list):
        players = doc["players"]
    elif isinstance(doc, list):
        players = doc
    else:
        raise SystemExit("Unsupported prospect_tags.json format; expected {players:[...]} or [...]")

    updated_fv = 0
    updated_status = 0
    missing_in_csv = 0

    for p in players:
        upid = str(p.get("upid") or "").strip()
        if not upid:
            continue

        if upid not in csv_map:
            missing_in_csv += 1
            continue

        fv2026, fv2025, fv2024, is_int = csv_map[upid]

        # Update FV as numeric values (or null)
        fv_obj = p.get("fv")
        if not isinstance(fv_obj, dict):
            fv_obj = {}

        before = (fv_obj.get("2026"), fv_obj.get("2025"), fv_obj.get("2024"))
        fv_obj["2026"] = fv2026
        fv_obj["2025"] = fv2025
        fv_obj["2024"] = fv2024
        after = (fv_obj.get("2026"), fv_obj.get("2025"), fv_obj.get("2024"))

        if before != after:
            updated_fv += 1

        p["fv"] = fv_obj

        # Add int_signee tag (preserve all other tags)
        if is_int:
            status = _coerce_status_list(p.get("status"))
            if "int_signee" not in status:
                status.append("int_signee")
                p["status"] = status
                updated_status += 1

    print(f"CSV rows: {len(csv_map)}")
    print(f"Players in JSON: {len(players)}")
    print(f"Players updated (FV): {updated_fv}")
    print(f"Players updated (status add int_signee): {updated_status}")
    print(f"Players missing in CSV (by UPID): {missing_in_csv}")

    if args.dry_run:
        return

    with open(args.json, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
