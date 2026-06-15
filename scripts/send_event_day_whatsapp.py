#!/usr/bin/env python3
"""
Send event_day_reminder_credit WhatsApp template to guests.

Usage:
  python send_event_day_whatsapp.py --test
  python send_event_day_whatsapp.py --test --phones 0502307500,0527488779
  python send_event_day_whatsapp.py --send-all
  python send_event_day_whatsapp.py --send-all --status ממתין
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

# אילנית אסייג — event owner
EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"
TEMPLATE_NAME = "event_day_reminder_credit"
TEMPLATE_LANGUAGE = "en"

# Template buttons: base URL + {{1}} suffix only (not full URL)
# ניווט: https://waze.com/ul/{{1}}
WAZE_BUTTON_SUFFIX = "hsv89zbmtt"
# מתנה באשראי: https://l5k.me/{{1}}
GIFT_BUTTON_SUFFIX = "bk5Fv"

# Approved template body (event_day_reminder_credit · English):
# {{1}} = couple names, {{2}} = venue, {{3}} = time
TEMPLATE_BODY_COUPLE = "אבנר (אבי) וטליה"
TEMPLATE_BODY_VENUE = "אולמי אודיסאה"
TEMPLATE_BODY_TIME = "19:30"

# Fallback header if event row missing (updated invitation PNG)
DEFAULT_HEADER_IMAGE = (
    "https://cxlmixykahuchilhyjjv.supabase.co/storage/v1/object/public/"
    "event-images/invitations/534f0271-1255-44fd-a809-17e87ffc0539/1781160066895.png"
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


def fetch_event() -> dict[str, Any]:
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["EXPO_PUBLIC_SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    r = requests.get(
        f"{base}/rest/v1/events",
        headers=headers,
        params={
            "select": "id,groom_name,bride_name,location,reception_time,invitation_image_url",
            "id": f"eq.{EVENT_ID}",
            "limit": "1",
        },
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"Event not found: {EVENT_ID}")
    return rows[0]


def body_params() -> list[str]:
    """{{1}} couple, {{2}} venue, {{3}} time — per approved template."""
    return [
        os.environ.get("WHATSAPP_BODY_COUPLE") or TEMPLATE_BODY_COUPLE,
        os.environ.get("WHATSAPP_BODY_VENUE") or TEMPLATE_BODY_VENUE,
        os.environ.get("WHATSAPP_BODY_TIME") or TEMPLATE_BODY_TIME,
    ]


def header_image_url(event: dict[str, Any]) -> str:
    url = (
        os.environ.get("WHATSAPP_HEADER_IMAGE_URL")
        or event.get("invitation_image_url")
        or DEFAULT_HEADER_IMAGE
    ).strip()
    if not url:
        raise RuntimeError("Missing invitation_image_url for event")
    return url


def build_payload(*, to: str, event: dict[str, Any]) -> dict[str, Any]:
    params = body_params()
    components: list[dict[str, Any]] = [
        {
            "type": "header",
            "parameters": [{"type": "image", "image": {"link": header_image_url(event)}}],
        },
        {
            "type": "body",
            "parameters": [{"type": "text", "text": p} for p in params],
        },
        {
            "type": "button",
            "sub_type": "url",
            "index": "0",
            "parameters": [
                {
                    "type": "text",
                    "text": os.environ.get("WHATSAPP_WAZE_BUTTON_SUFFIX") or WAZE_BUTTON_SUFFIX,
                }
            ],
        },
        {
            "type": "button",
            "sub_type": "url",
            "index": "1",
            "parameters": [
                {
                    "type": "text",
                    "text": os.environ.get("WHATSAPP_GIFT_BUTTON_SUFFIX") or GIFT_BUTTON_SUFFIX,
                }
            ],
        },
    ]
    return {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": TEMPLATE_NAME,
            "language": {"code": TEMPLATE_LANGUAGE},
            "components": components,
        },
    }


def fetch_guests(status_filter: str | None, exclude_status: str | None = None) -> list[dict[str, Any]]:
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["EXPO_PUBLIC_SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    params: dict[str, str] = {
        "select": "id,name,phone,status",
        "event_id": f"eq.{EVENT_ID}",
        "order": "name.asc",
        "limit": "1000",
    }
    if status_filter:
        params["status"] = f"eq.{status_filter}"
    elif exclude_status:
        params["status"] = f"neq.{exclude_status}"

    rows: list[dict] = []
    offset = 0
    while True:
        params["offset"] = str(offset)
        r = requests.get(f"{base}/rest/v1/guests", headers=headers, params=params, timeout=60)
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
    parser = argparse.ArgumentParser(description="Send event_day_reminder_credit WhatsApp template")
    parser.add_argument("--test", action="store_true", help="Send test messages only")
    parser.add_argument("--send-all", action="store_true", help="Send to all guests in event")
    parser.add_argument("--phones", default="", help="Comma-separated test phones")
    parser.add_argument("--status", default="", help="Filter guests by status (e.g. ממתין)")
    parser.add_argument("--exclude-status", default="", help="Exclude guests with this status (e.g. לא מגיע)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between sends")
    args = parser.parse_args()

    if not (args.test or args.send_all):
        parser.error("Choose --test or --send-all")

    token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    pnid = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    if not token or not pnid:
        print("Missing WhatsApp credentials in expo/.env", file=sys.stderr)
        return 1

    event = fetch_event()
    body = body_params()
    print(f"Event: {EVENT_ID}")
    print(f"Template: {TEMPLATE_NAME} (lang={TEMPLATE_LANGUAGE})")
    print(f"Body params: {body}")
    print(f"Header image: {header_image_url(event)[:80]}...")

    if args.test:
        phones_raw = args.phones or os.environ.get("WHATSAPP_TEST_PHONES", "0502307500,0527488779")
        targets = [{"name": "בדיקה", "phone": p.strip()} for p in phones_raw.split(",") if p.strip()]
    else:
        if args.status and args.exclude_status:
            print("Use only one of --status or --exclude-status", file=sys.stderr)
            return 1
        targets = fetch_guests(args.status or None, args.exclude_status or None)
        print(f"Guests to send: {len(targets)}")

    ok = fail = skip = 0
    for i, g in enumerate(targets):
        phone = _send.normalize_phone(g.get("phone"))
        label = str(g.get("name") or phone or "בדיקה")
        if not phone:
            print(f"[{i+1}/{len(targets)}] SKIP {label}: no phone", file=sys.stderr)
            skip += 1
            continue
        payload = build_payload(to=phone, event=event)
        try:
            result = _send.send_message(phone_number_id=pnid, access_token=token, payload=payload)
            msg_id = (result.get("messages") or [{}])[0].get("id", "?")
            print(f"[{i+1}/{len(targets)}] OK {label} ({phone}) -> {msg_id}")
            ok += 1
        except Exception as e:
            print(f"[{i+1}/{len(targets)}] FAIL {label}: {e}", file=sys.stderr)
            fail += 1
        if i + 1 < len(targets) and args.delay > 0:
            time.sleep(args.delay)

    print(f"\nDone: sent={ok}, failed={fail}, skipped={skip}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
