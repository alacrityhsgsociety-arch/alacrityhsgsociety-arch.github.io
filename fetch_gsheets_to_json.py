import gspread
import json
import os
import shutil
from oauth2client.service_account import ServiceAccountCredentials

# ----------------------------
# CONFIG
# ----------------------------

SCOPE = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
]

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
SPREADSHEET_ID = "1hr552f5mHHpAYnTv8kkE7NgP1-1HaMJ7RIDm4foXbc8"

# Dictionary of tabs and columns you want to fetch
# Empty list = fetch all columns
TABS_COLUMNS = {
    "Inflow 26-27": ["Item", "Category", "Date", "Amount", "Payment From", "Mode"],
    "Expenses 26-27": ["Category", "Sub Category", "Date", "Amount", "Payment To", "Mode", "Checked"],
    "fixed deposit": ["Category", "Account", "Amount"]
}

OUTPUT_DIR = "data"

# ----------------------------
# HELPERS
# ----------------------------

def clean_headers(headers):
    """Ensure headers are unique and not blank."""
    seen = {}
    cleaned = []
    for i, h in enumerate(headers):
        if not h.strip():
            h = f"Column_{i+1}"
        if h in seen:
            seen[h] += 1
            h = f"{h}_{seen[h]}"
        else:
            seen[h] = 0
        cleaned.append(h)
    return cleaned

# ----------------------------
# MAIN FUNCTION
# ----------------------------

def fetch_selected_columns(tab_columns_map):
    # Delete old JSON files
    YEARS = ["25-26"]  # add more years as needed
    KEEP_FILES = set()
    for year in YEARS:
        KEEP_FILES.add(f"expenses_{year}.json")
        KEEP_FILES.add(f"inflow_{year}.json")

    if os.path.exists(OUTPUT_DIR):
        for filename in os.listdir(OUTPUT_DIR):
            file_path = os.path.join(OUTPUT_DIR, filename)

            if filename not in KEEP_FILES:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
    else:
        os.makedirs(OUTPUT_DIR, exist_ok=True)

    if GOOGLE_SERVICE_ACCOUNT_JSON:
        creds = ServiceAccountCredentials.from_json_keyfile_dict(
            json.loads(GOOGLE_SERVICE_ACCOUNT_JSON),
            SCOPE
        )
    else:
        creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_FILE, SCOPE)
    client = gspread.authorize(creds)

    print(f"🔑 Using service account: {creds.service_account_email}")

    sheet = client.open_by_key(SPREADSHEET_ID)
    print(f"✅ Connected! Spreadsheet: {sheet.title}")

    json_files = []

    for tab, columns in tab_columns_map.items():
        try:
            ws = sheet.worksheet(tab)
            print(f"⬇️ Fetching tab: {ws.title}")

            rows = ws.get_all_values()
            if not rows:
                data = []
            else:
                headers = clean_headers(rows[0])
                all_data = [dict(zip(headers, row)) for row in rows[1:]]  # skip header

                # ✅ Limit to first 1000 rows
                all_data = all_data[:1000]

                filter_columns = columns or headers

                # Skip rows empty in the exported columns, but keep valid expense rows
                # even if Category is blank.
                all_data = [
                    row for row in all_data
                    if any((row.get(col) or "").strip() for col in filter_columns)
                ]

                # Fetch only selected columns if list is not empty
                if columns:
                    data = [{col: row.get(col, None) for col in columns} for row in all_data]
                else:
                    data = all_data

            safe_title = ws.title.lower().replace(" ", "_").replace("/", "_")
            filename = os.path.join(OUTPUT_DIR, f"{safe_title}.json")

            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            json_files.append(os.path.basename(filename))
            print(f"✅ Saved {len(data)} rows → {filename}")

        except Exception as e:
            print(f"❌ Tab '{tab}' error: {e}")

    # Generate index.json for frontend
    index_file = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(json_files, f, indent=2)
    print(f"✅ Generated index.json with {len(json_files)} files")

# ----------------------------
# ENTRY POINT
# ----------------------------

if __name__ == "__main__":
    fetch_selected_columns(TABS_COLUMNS)
