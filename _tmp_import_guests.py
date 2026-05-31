import json
import urllib.error
import urllib.request

SUPABASE_URL = "https://cxlmixykahuchilhyjjv.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bG1peHlrYWh1Y2hpbGh5amp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDE5MjExOCwiZXhwIjoyMDg1NzY4MTE4fQ.v4b1cGRJiO3cR54UKkz1dQ34iTZBq3D-X90d_3iN9Cc"
EVENT_ID = "534f0271-1255-44fd-a809-17e87ffc0539"

CATEGORY_DEFS = [
    ("מוזמנים חתן", "groom", "cat_groom"),
    ("מוזמנים כלה", "bride", "cat_bride"),
    ("מוזמנים הורי החתן", "groom", "cat_groom_parents"),
]


def api(method: str, path: str, body=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        raise RuntimeError(f"{method} {path} failed ({e.code}): {err}") from e


def main():
    with open("_tmp_guests_import.json", encoding="utf-8") as f:
        payload = json.load(f)

    guests = payload["guests"]
    print(f"Importing {len(guests)} guests for event {EVENT_ID}")

    category_ids = {}
    for name, side, key in CATEGORY_DEFS:
        status, rows = api(
            "POST",
            "guest_categories",
            [{"event_id": EVENT_ID, "name": name, "side": side}],
            prefer="return=representation",
        )
        category_ids[key] = rows[0]["id"]
        print(f"Created category {name}: {rows[0]['id']}")

    key_map = {
        "מוזמנים חתן": category_ids["cat_groom"],
        "מוזמנים כלה": category_ids["cat_bride"],
        "מוזמנים הורי החתן": category_ids["cat_groom_parents"],
    }

    records = []
    for guest in guests:
        records.append(
            {
                "event_id": EVENT_ID,
                "name": guest["name"],
                "phone": guest["phone"],
                "category_id": key_map[guest["category_key"]],
                "status": "ממתין",
                "number_of_people": 1,
            }
        )

    batch_size = 100
    inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        api("POST", "guests", batch, prefer="return=minimal")
        inserted += len(batch)
        print(f"Inserted batch {i // batch_size + 1}: {inserted}/{len(records)}")

    status, count_rows = api(
        "GET",
        f"guests?event_id=eq.{EVENT_ID}&select=id",
    )
    print(f"Done. Total guests in event: {len(count_rows)}")


if __name__ == "__main__":
    main()
