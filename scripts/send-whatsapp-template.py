#!/usr/bin/env python3
"""
Send approved WhatsApp template messages to guests from an Excel file.

Usage:
  pip install -r whatsapp-template-requirements.txt
  copy .env.example .env   # fill WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEST_TO
  python send-whatsapp-template.py --dry-run
  python send-whatsapp-template.py --test
  python send-whatsapp-template.py --send-all --limit 5
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

try:
    import openpyxl
    import requests
except ImportError:
    print("Missing deps. Run: pip install -r whatsapp-template-requirements.txt", file=sys.stderr)
    sys.exit(1)


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def normalize_phone(raw: Any) -> str | None:
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw).strip())
    if not digits:
        return None
    if digits.startswith("972"):
        return digits
    if digits.startswith("0"):
        return "972" + digits[1:]
    if len(digits) == 9 and digits[0] in "23456789":
        return "972" + digits
    return digits


WHATSAPP_TEMPLATE_URL_PREFIX = "fCdvMYab4H16"


def strip_template_url_prefix(slug: str) -> str:
    """Remove static prefix baked into WhatsApp template button URL before {{1}}."""
    prefix = (os.environ.get("WHATSAPP_BUTTON_STRIP_PREFIX") or WHATSAPP_TEMPLATE_URL_PREFIX).strip()
    if prefix and slug.startswith(prefix):
        return slug[len(prefix) :]
    return slug


def url_button_suffix(link: str | None) -> str | None:
    """
    Slug sent as {{1}} for template .../i/fCdvMYab4H16{{1}}.
    Must be the real invitation_code only (prefix stripped if present in Excel).
    """
    if not link:
        return None
    link = str(link).strip()
    m = re.search(r"/i/([^/?#]+)", link)
    if m:
        slug = strip_template_url_prefix(m.group(1))
        return slug or None
    slug = strip_template_url_prefix(link.rstrip("/").split("/")[-1] or "")
    return slug or None


def read_guests(excel_path: Path) -> list[dict[str, Any]]:
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter, None)
    if not header:
        wb.close()
        return []

    # Columns: name, phone, link (Hebrew headers; position-based)
    guests: list[dict[str, Any]] = []
    for row in rows_iter:
        if not row:
            continue
        name = row[0] if len(row) > 0 else None
        phone_raw = row[1] if len(row) > 1 else None
        link = row[2] if len(row) > 2 else None
        phone = normalize_phone(phone_raw)
        if not phone:
            continue
        guests.append(
            {
                "name": (str(name).strip() if name is not None else "") or None,
                "phone": phone,
                "link": (str(link).strip() if link is not None else None) or None,
            }
        )
    wb.close()
    return guests


def build_template_payload(
    *,
    to: str,
    template_name: str,
    language_code: str,
    header_image_url: str | None,
    button_suffix: str | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }

    components: list[dict[str, Any]] = []

    if header_image_url:
        components.append(
            {
                "type": "header",
                "parameters": [
                    {
                        "type": "image",
                        "image": {"link": header_image_url},
                    }
                ],
            }
        )

    if button_suffix:
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": button_suffix}],
            }
        )

    if components:
        payload["template"]["components"] = components

    return payload


def send_message(
    *,
    phone_number_id: str,
    access_token: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url = f"https://graph.facebook.com/v21.0/{phone_number_id}/messages"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text}
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {data}")
    return data


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    load_dotenv(script_dir / ".env")
    load_dotenv(script_dir.parent / "expo" / ".env")

    parser = argparse.ArgumentParser(description="Send WhatsApp template to wedding guests")
    parser.add_argument("--dry-run", action="store_true", help="Only list guests, no API calls")
    parser.add_argument("--test", action="store_true", help="Send one message to WHATSAPP_TEST_TO")
    parser.add_argument("--send-all", action="store_true", help="Send to all guests in Excel")
    parser.add_argument("--limit", type=int, default=0, help="Max messages (0 = no limit)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between sends")
    args = parser.parse_args()

    if not (args.dry_run or args.test or args.send_all):
        parser.error("Choose one of: --dry-run, --test, --send-all")

    excel_path = Path(
        os.environ.get(
            "GUEST_EXCEL_PATH",
            r"c:\Users\איתי\OneDrive\שולחן העבודה\מוזמנים-ממתינים-חתונה-2026-06-02 (1).xlsx",
        )
    )
    if not excel_path.is_file():
        print(f"Excel not found: {excel_path}", file=sys.stderr)
        return 1

    guests = read_guests(excel_path)
    print(f"Loaded {len(guests)} guests from {excel_path.name}")

    template_name = os.environ.get("WHATSAPP_TEMPLATE_NAME", "wedding_talia_avner")
    language_code = os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "en")
    use_button_suffix = os.environ.get("WHATSAPP_BUTTON_URL_SUFFIX_FROM_LINK", "true").lower() in (
        "1",
        "true",
        "yes",
    )
    header_image_url = os.environ.get("WHATSAPP_HEADER_IMAGE_URL") or None

    if args.dry_run:
        for i, g in enumerate(guests[:10]):
            suffix = url_button_suffix(g["link"]) if use_button_suffix else None
            print(f"  [{i+1}] {g.get('name') or '—'} | {g['phone']} | btn_suffix={suffix}")
        if len(guests) > 10:
            print(f"  ... and {len(guests) - 10} more")
        print("\nDry run OK. Set .env and run with --test to send one message.")
        return 0

    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    if not access_token or not phone_number_id:
        print(
            "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in scripts/.env",
            file=sys.stderr,
        )
        return 1

    targets: list[dict[str, Any]]
    if args.test:
        test_to = normalize_phone(os.environ.get("WHATSAPP_TEST_TO", ""))
        if not test_to:
            print("Set WHATSAPP_TEST_TO in .env (your phone for a test send)", file=sys.stderr)
            return 1
        test_link = (os.environ.get("WHATSAPP_TEST_LINK") or "").strip() or None
        if not test_link and guests:
            test_link = guests[0].get("link")
        targets = [
            {
                "name": "בדיקה",
                "phone": test_to,
                "link": test_link,
            }
        ]
        if language_code.lower() in ("he", "he_il", "iw"):
            print(
                "Warning: template is registered as English in WhatsApp Manager; use WHATSAPP_TEMPLATE_LANGUAGE=en",
                file=sys.stderr,
            )
        suffix_preview = url_button_suffix(targets[0].get("link")) if targets else None
        print(
            f"Test send to {test_to} (template={template_name}, lang={language_code}, "
            f"button {{{{1}}}}={suffix_preview!r} -> .../i/{WHATSAPP_TEMPLATE_URL_PREFIX}{suffix_preview})"
        )
    else:
        targets = guests
        if args.limit > 0:
            targets = targets[: args.limit]

    ok = 0
    fail = 0
    for i, g in enumerate(targets):
        suffix = url_button_suffix(g["link"]) if use_button_suffix else None
        payload = build_template_payload(
            to=g["phone"],
            template_name=template_name,
            language_code=language_code,
            header_image_url=header_image_url,
            button_suffix=suffix,
        )
        label = g.get("name") or g["phone"]
        try:
            result = send_message(
                phone_number_id=phone_number_id,
                access_token=access_token,
                payload=payload,
            )
            msg_id = (result.get("messages") or [{}])[0].get("id", "?")
            print(f"[{i+1}/{len(targets)}] OK {label} -> {msg_id}")
            ok += 1
        except Exception as e:
            print(f"[{i+1}/{len(targets)}] FAIL {label}: {e}", file=sys.stderr)
            fail += 1
        if i + 1 < len(targets) and args.delay > 0:
            time.sleep(args.delay)

    print(f"\nDone: {ok} sent, {fail} failed")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
