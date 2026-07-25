#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/update-expenses.log"
SCRIPT_PATH="$PROJECT_DIR/fetch_gsheets_to_json.py"

if [ -x "$PROJECT_DIR/myenv/bin/python3" ]; then
  PYTHON_BIN="$PROJECT_DIR/myenv/bin/python3"
else
  PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

mkdir -p "$LOG_DIR"

{
  echo "=== Script run at $(date) ==="
  cd "$PROJECT_DIR"
  "$PYTHON_BIN" "$SCRIPT_PATH"

  CHANGES=$(git status --porcelain -- data)
  if [ -n "$CHANGES" ]; then
    git add data/*.json
    git commit -m "Update finance data"
    git push origin main
    echo "Changes committed and pushed at $(date)"
  else
    echo "No data changes to commit at $(date)"
  fi

  echo "=== Script completed at $(date) ==="
} >> "$LOG_FILE" 2>&1
