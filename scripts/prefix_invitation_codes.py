#!/usr/bin/env python3
"""Prefix invitation_code for guests listed in wedding Excel."""

import json
import os
import re
import sys
from pathlib import Path

import openpyxl
import requests

PREFIX = "fCdvMYab4H16"
EXCEL = Path(
    r"c:\Users\איתי\OneDrive\שולחן העבודה\מוזמנים-ממתינים-חתונה-2026-06-02 (1).xlsx"
)
EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"


def load_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / "expo" / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        if k and k not in os.environ:
            os.environ[k] = v.strip().strip('"').strip("'")


def read_codes() -> list[str]:
    wb = openpyxl.load_workbook(EXCEL, read_only=True, data_only=True)
    ws = wb.active
    codes: list[str] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[1]:
            continue
        link = str(row[2] or "")
        m = re.search(r"/i/([^/?#]+)", link)
        if not m:
            continue
        code = m.group(1)
        if code.startswith(PREFIX):
            code = code[len(PREFIX) :]
        codes.append(code)
    wb.close()
    return codes


def run_sql(query: str) -> dict:
    url = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/execute_sql"
    # Use PostgREST patch via service role - actually use direct SQL through management API
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ.get("EXPO_PUBLIC_SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise RuntimeError("Missing service role key in expo/.env")

    # Supabase doesn't expose arbitrary SQL on REST; use pg via rpc if exists, else postgrest row updates
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    return headers, base, key


def main() -> int:
    load_env()
    codes = read_codes()
    print(f"Excel codes: {len(codes)}")

    key = os.environ.get("EXPO_PUBLIC_SUPABASE_SERVICE_KEY")
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    updated = 0
    skipped = 0
    not_found = 0
    errors = 0

    for code in codes:
        new_code = PREFIX + code
        # fetch guest by current code
        r = requests.get(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={
                "select": "id,invitation_code",
                "invitation_code": f"eq.{code}",
                "event_id": f"eq.{EVENT_ID}",
                "limit": "1",
            },
            timeout=30,
        )
        if not r.ok:
            print(f"GET fail {code}: {r.status_code} {r.text[:200]}", file=sys.stderr)
            errors += 1
            continue
        rows = r.json()
        if not rows:
            not_found += 1
            print(f"NOT FOUND: {code}", file=sys.stderr)
            continue
        row = rows[0]
        if str(row.get("invitation_code", "")).startswith(PREFIX):
            skipped += 1
            continue
        patch = requests.patch(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={"id": f"eq.{row['id']}"},
            json={"invitation_code": new_code},
            timeout=30,
        )
        if patch.ok:
            updated += 1
        else:
            print(f"PATCH fail {code}: {patch.status_code} {patch.text[:200]}", file=sys.stderr)
            errors += 1

    print(f"Done: updated={updated}, skipped={skipped}, not_found={not_found}, errors={errors}")
    return 0 if errors == 0 and not_found == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
