#!/usr/bin/env python3
"""Check event date and guest counts."""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


load_dotenv(Path(__file__).parent.parent / "expo" / ".env")

EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"
base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
key = os.environ["EXPO_PUBLIC_SUPABASE_SERVICE_KEY"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

r = requests.get(
    f"{base}/rest/v1/events",
    headers=headers,
    params={"select": "*", "id": f"eq.{EVENT_ID}", "limit": "1"},
    timeout=30,
)
ev = r.json()[0]
print("=== Event ===")
for k in ("event_date", "reception_time", "location", "groom_name", "bride_name"):
    print(f"  {k}: {ev.get(k)}")

# Guest status breakdown
r = requests.get(
    f"{base}/rest/v1/guests",
    headers=headers,
    params={"select": "status", "event_id": f"eq.{EVENT_ID}", "limit": "2000"},
    timeout=60,
)
guests = r.json()
from collections import Counter

c = Counter(g.get("status") for g in guests)
print(f"\n=== Guests: {len(guests)} total ===")
for status, n in c.most_common():
    print(f"  {status}: {n}")
