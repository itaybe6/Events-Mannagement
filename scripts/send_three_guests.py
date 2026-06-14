#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path

import requests

_spec = importlib.util.spec_from_file_location(
    "send_wa",
    Path(__file__).parent / "send-whatsapp-template.py",
)
_send = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_send)  # type: ignore

WHATSAPP_TEMPLATE_URL_PREFIX = _send.WHATSAPP_TEMPLATE_URL_PREFIX
build_template_payload = _send.build_template_payload
load_dotenv = _send.load_dotenv
normalize_phone = _send.normalize_phone
send_message = _send.send_message
strip_template_url_prefix = _send.strip_template_url_prefix

PREFIX = WHATSAPP_TEMPLATE_URL_PREFIX
HEADER_IMG = (
    "https://cxlmixykahuchilhyjjv.supabase.co/storage/v1/object/public/"
    "event-images/invitations/534f0271-1255-44fd-a809-17e87ffc0539/1779986335986.jpg"
)

# Phone from user image -> guest id in DB (אינה = איה 052-414-0320)
GUESTS = [
    {"id": "ac484bda-ac71-4af7-9625-fb2ca68ee814", "phone": "0524140320", "label": "אינה (איה)"},
    {"id": "ab3cbcba-5012-4e67-8ef6-82a894d0257d", "phone": "0503121015", "label": "חזי"},
    {"id": "46f1e9ca-ebae-4d9d-ad42-ed4c892e8047", "phone": "0507116048", "label": "עזרא"},
]


def main() -> int:
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / "expo" / ".env")

    key = os.environ.get("EXPO_PUBLIC_SUPABASE_SERVICE_KEY", "").strip()
    base = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    token = os.environ["WHATSAPP_ACCESS_TOKEN"].strip()
    pnid = os.environ["WHATSAPP_PHONE_NUMBER_ID"].strip()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    ok = 0
    for g in GUESTS:
        r = requests.get(
            f"{base}/rest/v1/guests",
            headers=headers,
            params={"select": "id,name,invitation_code", "id": f"eq.{g['id']}", "limit": "1"},
            timeout=30,
        )
        r.raise_for_status()
        row = r.json()[0]
        code = str(row["invitation_code"])
        if not code.startswith(PREFIX):
            new_code = PREFIX + code
            patch = requests.patch(
                f"{base}/rest/v1/guests",
                headers={**headers, "Prefer": "return=representation"},
                params={"id": f"eq.{g['id']}"},
                json={"invitation_code": new_code},
                timeout=30,
            )
            patch.raise_for_status()
            code = new_code
            print(f"PREFIX OK {g['label']}: {code}")
        else:
            print(f"PREFIX skip {g['label']}: already prefixed")

        suffix = strip_template_url_prefix(code)
        to = normalize_phone(g["phone"])
        payload = build_template_payload(
            to=to,
            template_name="wedding_talia_avner",
            language_code="en",
            header_image_url=HEADER_IMG,
            button_suffix=suffix,
        )
        result = send_message(phone_number_id=pnid, access_token=token, payload=payload)
        msg_id = (result.get("messages") or [{}])[0].get("id", "?")
        print(f"SENT OK {g['label']} ({to}) -> {msg_id}")
        ok += 1

    print(f"\nDone: {ok}/{len(GUESTS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
