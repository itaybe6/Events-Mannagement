#!/usr/bin/env python3
"""Probe WABA candidates: verification status + analytics."""
from __future__ import annotations

import json
import os
import time
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

TOKEN = os.environ["WHATSAPP_ACCESS_TOKEN"].strip()
PNID = os.environ["WHATSAPP_PHONE_NUMBER_ID"].strip()
GV = "v21.0"


def get(node: str, params: dict) -> dict:
    p = {**params, "access_token": TOKEN}
    r = requests.get(f"https://graph.facebook.com/{GV}/{node}", params=p, timeout=40)
    try:
        return r.json()
    except Exception:
        return {"_status": r.status_code, "_text": r.text[:800]}


# 1) Try to discover WABA via phone number's owner / message templates
print("=== phone number extended ===")
print(json.dumps(get(PNID, {"fields": "id,display_phone_number,verified_name,account_mode,is_official_business_account,is_pin_enabled"}), ensure_ascii=False, indent=2))

# The phone number's parent WABA — list message_templates needs the WABA, but
# we can reach the WABA from the phone number via the 'whatsapp_business_account' edge name varies.
# Try a few known candidate ids from URLs.
candidates = ["3607194519435143", "1145567135305219"]
now = int(time.time())
start = now - 3 * 24 * 3600
for c in candidates:
    print(f"\n=== candidate {c}: WABA fields ===")
    print(json.dumps(get(c, {"fields": "id,name,account_review_status,business_verification_status,on_behalf_of_business_info,ownership_type"}), ensure_ascii=False, indent=2))
    print(f"--- candidate {c}: analytics ---")
    print(json.dumps(get(c, {"fields": f"analytics.start({start}).end({now}).granularity(DAY)"}), ensure_ascii=False, indent=2)[:1500])
