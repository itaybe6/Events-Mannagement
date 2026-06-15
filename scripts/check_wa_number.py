#!/usr/bin/env python3
"""Diagnose WhatsApp number status, messaging limit, and recent analytics."""
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


def get(url: str, params: dict) -> dict:
    params = {**params, "access_token": TOKEN}
    r = requests.get(f"https://graph.facebook.com/{GV}/{url}", params=params, timeout=30)
    try:
        return r.json()
    except Exception:
        return {"_status": r.status_code, "_text": r.text[:500]}


print("=== Phone number status ===")
info = get(
    PNID,
    {
        "fields": "verified_name,display_phone_number,quality_rating,"
        "messaging_limit_tier,throughput,status,name_status,"
        "code_verification_status,platform_type"
    },
)
print(json.dumps(info, ensure_ascii=False, indent=2))

# Find WABA id to query analytics
print("\n=== WABA (account) ===")
waba = get(PNID, {"fields": "whatsapp_business_account"})
print(json.dumps(waba, ensure_ascii=False, indent=2))
