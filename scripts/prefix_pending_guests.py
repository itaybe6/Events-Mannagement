#!/usr/bin/env python3
"""Add WhatsApp template prefix to pending guests in the wedding event."""

import os
import sys
from pathlib import Path

import requests

PREFIX = "fCdvMYab4H16"
EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"
PENDING_STATUS = "ממתין"


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


def main() -> int:
    load_env()
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ.get("EXPO_PUBLIC_SUPABASE_SERVICE_KEY", "").strip()
    if not key:
        print("Missing EXPO_PUBLIC_SUPABASE_SERVICE_KEY", file=sys.stderr)
        return 1

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    rows: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={
                "select": "id,invitation_code,status,name",
                "event_id": f"eq.{EVENT_ID}",
                "status": f"eq.{PENDING_STATUS}",
                "limit": "1000",
                "offset": str(offset),
            },
            timeout=60,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    need = [
        g
        for g in rows
        if g.get("invitation_code")
        and str(g["invitation_code"]).strip()
        and not str(g["invitation_code"]).startswith(PREFIX)
    ]
    already = len(rows) - len(need)

    print(f"Pending guests: {len(rows)}")
    print(f"Already prefixed: {already}")
    print(f"To update: {len(need)}")

    updated = 0
    errors = 0
    for g in need:
        new_code = PREFIX + str(g["invitation_code"])
        p = requests.patch(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={"id": f"eq.{g['id']}"},
            json={"invitation_code": new_code},
            timeout=30,
        )
        if p.ok:
            updated += 1
        else:
            errors += 1
            print(f"FAIL {g.get('name')} ({g['id']}): {p.status_code} {p.text[:150]}", file=sys.stderr)

    print(f"Done: updated={updated}, errors={errors}")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
