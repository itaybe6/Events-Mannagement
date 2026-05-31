import json

with open(r"c:\Users\איתי\OneDrive\שולחן העבודה\פרויקטים\Events-Mannagement\Events-Mannagement\_tmp_xlsx_output.json", encoding="utf-8") as f:
    data = json.load(f)

summary = {}
for sheet_name, info in data.items():
    rows = info["rows"]
    summary[sheet_name] = {
        "max_row": info["max_row"],
        "max_col": info["max_col"],
        "first_15_rows": rows[:15],
        "last_5_rows": rows[-5:],
        "total_rows": len(rows),
    }

with open(r"c:\Users\איתי\OneDrive\שולחן העבודה\פרויקטים\Events-Mannagement\Events-Mannagement\_tmp_summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print("Sheets:", list(data.keys()))
for k, v in summary.items():
    print(f"  {k}: rows={v['total_rows']}, cols={v['max_col']}")
