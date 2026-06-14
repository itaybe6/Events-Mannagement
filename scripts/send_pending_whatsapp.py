#!/usr/bin/env python3
"""Send WhatsApp template to all pending guests in the wedding event."""

import importlib.util
import os
import sys
import time
from pathlib import Path

import requests

EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"
PENDING_STATUS = "ממתין"
HEADER_IMG = (
    "https://cxlmixykahuchilhyjjv.supabase.co/storage/v1/object/public/"
    "event-images/invitations/534f0271-1255-44fd-a809-17e87ffc0539/1779986335986.jpg"
)

_spec = importlib.util.spec_from_file_location(
    "send_wa",
    Path(__file__).parent / "send-whatsapp-template.py",
)
_send = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_send)  # type: ignore


def load_env() -> None:
    _send.load_dotenv(Path(__file__).parent / ".env")
    _send.load_dotenv(Path(__file__).parent.parent / "expo" / ".env")


def fetch_pending_guests() -> list[dict]:
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["EXPO_PUBLIC_SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={
                "select": "id,name,phone,invitation_code",
                "event_id": f"eq.{EVENT_ID}",
                "status": f"eq.{PENDING_STATUS}",
                "order": "name.asc",
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
    return rows


def main() -> int:
    load_env()
    token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    pnid = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    if not token or not pnid:
        print("Missing WhatsApp credentials in expo/.env", file=sys.stderr)
        return 1

    guests = fetch_pending_guests()
    print(f"Pending guests to send: {len(guests)}")

    ok = 0
    fail = 0
    skipped = 0
    delay = float(os.environ.get("WHATSAPP_SEND_DELAY", "1.0"))

    for i, g in enumerate(guests):
        phone = _send.normalize_phone(g.get("phone"))
        code = str(g.get("invitation_code") or "").strip()
        label = str(g.get("name") or phone or g.get("id"))

        if not phone:
            print(f"[{i+1}/{len(guests)}] SKIP {label}: no phone", file=sys.stderr)
            skipped += 1
            continue
        if not code:
            print(f"[{i+1}/{len(guests)}] SKIP {label}: no invitation_code", file=sys.stderr)
            skipped += 1
            continue

        suffix = _send.strip_template_url_prefix(code)
        payload = _send.build_template_payload(
            to=phone,
            template_name=os.environ.get("WHATSAPP_TEMPLATE_NAME", "wedding_talia_avner"),
            language_code=os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "en"),
            header_image_url=os.environ.get("WHATSAPP_HEADER_IMAGE_URL") or HEADER_IMG,
            button_suffix=suffix,
        )
        try:
            result = _send.send_message(phone_number_id=pnid, access_token=token, payload=payload)
            msg_id = (result.get("messages") or [{}])[0].get("id", "?")
            print(f"[{i+1}/{len(guests)}] OK {label} -> {msg_id}")
            ok += 1
        except Exception as e:
            print(f"[{i+1}/{len(guests)}] FAIL {label}: {e}", file=sys.stderr)
            fail += 1

        if i + 1 < len(guests) and delay > 0:
            time.sleep(delay)

    print(f"\nDone: sent={ok}, failed={fail}, skipped={skipped}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
