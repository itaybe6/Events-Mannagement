import json
import urllib.error
import urllib.request
from collections import defaultdict

from _tmp_import_guests import SERVICE_KEY, SUPABASE_URL

EVENT_ID = "3b654ff7-38c3-4f85-9e37-17e5c8427827"
BATCH_SIZE = 100


def api(method: str, path: str, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        raise RuntimeError(f"{method} {path} failed ({e.code}): {err}") from e


def main():
    _, rows = api(
        "GET",
        f"guests?event_id=eq.{EVENT_ID}&select=id,category_id,name,phone,created_at&order=created_at.asc",
    )
    groups = defaultdict(list)
    for row in rows:
        key = (
            str(row.get("category_id") or ""),
            (row.get("name") or "").strip(),
            (row.get("phone") or "").strip(),
        )
        groups[key].append(row)

    delete_ids = []
    for members in groups.values():
        if len(members) <= 1:
            continue
        members.sort(key=lambda r: (r.get("created_at") or "", r["id"]))
        delete_ids.extend(m["id"] for m in members[1:])

    print(f"Found {len(delete_ids)} duplicate guests to delete (keeping {len(rows) - len(delete_ids)} unique)")

    deleted = 0
    for i in range(0, len(delete_ids), BATCH_SIZE):
        batch = delete_ids[i : i + BATCH_SIZE]
        id_list = ",".join(batch)
        api("DELETE", f"guests?id=in.({id_list})")
        deleted += len(batch)
        print(f"Deleted batch {i // BATCH_SIZE + 1}: {deleted}/{len(delete_ids)}")

    _, remaining = api("GET", f"guests?event_id=eq.{EVENT_ID}&select=id")
    print(f"Done. Remaining guests in event: {len(remaining)}")


if __name__ == "__main__":
    main()
