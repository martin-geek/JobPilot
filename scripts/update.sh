#!/bin/bash
# JobPilot Update Script
# Merges a new zip from Claude into your repo without overwriting
# your database, resume, config, or other local data.
#
# Usage:
#   ./scripts/update.sh ~/Downloads/jobpilot.zip

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/update.sh <path-to-jobpilot.zip>"
    echo "Example: ./scripts/update.sh ~/Downloads/jobpilot.zip"
    exit 1
fi

ZIP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR=$(mktemp -d)

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ File not found: $ZIP_FILE"
    exit 1
fi

echo "🧭 JobPilot Updater"
echo "==================="
echo "  Project: $PROJECT_DIR"
echo "  Update:  $ZIP_FILE"
echo ""

# Extract to temp directory
echo "📦 Extracting update..."
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"

# Find the root folder inside the zip (usually "jobpilot/")
ZIP_ROOT=$(find "$TEMP_DIR" -maxdepth 1 -type d ! -path "$TEMP_DIR" | head -1)
if [ -z "$ZIP_ROOT" ]; then
    ZIP_ROOT="$TEMP_DIR"
fi

# Files and directories to NEVER overwrite
PROTECTED=(
    "data/jobpilot.db"
    "data/master_resume.pdf"
    "data/resumes"
    "data/cover_letters"
    "data/logs"
    "config/settings.yaml"
    "backend/venv"
    "frontend/node_modules"
    ".git"
    ".env"
)

echo "🔄 Merging files..."

# Use rsync to merge — it copies new/updated files without deleting existing ones
# First, build the exclude list
EXCLUDES=""
for item in "${PROTECTED[@]}"; do
    EXCLUDES="$EXCLUDES --exclude=$item"
done

# Rsync: copy new and updated files, don't delete anything
rsync -av --ignore-existing $EXCLUDES "$ZIP_ROOT/" "$PROJECT_DIR/" > /dev/null 2>&1 || true

# Now copy files that SHOULD be updated (source code, not data)
UPDATE_DIRS=(
    "backend/agents"
    "backend/api"
    "backend/config"
    "backend/db"
    "backend/services"
    "backend/utils"
    "frontend/src"
    "scripts"
)

UPDATED=0
for dir in "${UPDATE_DIRS[@]}"; do
    if [ -d "$ZIP_ROOT/$dir" ]; then
        rsync -av "$ZIP_ROOT/$dir/" "$PROJECT_DIR/$dir/" > /dev/null 2>&1
        UPDATED=$((UPDATED + 1))
    fi
done

# Copy root-level files that should be updated
ROOT_FILES=(
    "backend/__init__.py"
    "backend/requirements.txt"
    "frontend/package.json"
    "frontend/vite.config.js"
    "frontend/tailwind.config.js"
    "frontend/postcss.config.js"
    "frontend/index.html"
    "config/settings.example.yaml"
    "README.md"
    ".gitignore"
)

for f in "${ROOT_FILES[@]}"; do
    if [ -f "$ZIP_ROOT/$f" ]; then
        cp "$ZIP_ROOT/$f" "$PROJECT_DIR/$f"
    fi
done

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Update complete!"
echo "  Updated $UPDATED source directories"
echo ""
echo "Protected (not touched):"
echo "  ✓ data/jobpilot.db"
echo "  ✓ data/master_resume.pdf"
echo "  ✓ config/settings.yaml"
echo "  ✓ backend/venv/"
echo "  ✓ frontend/node_modules/"
echo ""
echo "Next: restart with ./scripts/start.sh"
