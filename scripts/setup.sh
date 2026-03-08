#!/bin/bash
# JobPilot - First-time setup
# Run this once after cloning the repo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🧭 JobPilot Setup"
echo "================="
echo ""

cd "$PROJECT_DIR"

# ── Python Backend ────────────────────────────────
echo "📦 Setting up Python backend..."
cd backend

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Install it from https://www.python.org"
    exit 1
fi

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "🎭 Installing Playwright browser..."
playwright install chromium

cd "$PROJECT_DIR"
echo "   ✓ Backend dependencies installed"
echo ""

# ── Frontend ──────────────────────────────────────
echo "📦 Setting up React frontend..."
cd frontend

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install it from https://nodejs.org"
    exit 1
fi

npm install
cd "$PROJECT_DIR"
echo "   ✓ Frontend dependencies installed"
echo ""

# ── Configuration ─────────────────────────────────
if [ ! -f "config/settings.yaml" ]; then
    cp config/settings.example.yaml config/settings.yaml
    echo "📝 Created config/settings.yaml"
    echo "   ⚠️  Edit this file to add your Anthropic API key!"
else
    echo "   ✓ config/settings.yaml already exists"
fi
echo ""

# ── Database ──────────────────────────────────────
echo "🗄️  Initializing database..."
cd backend
source venv/bin/activate
python -m db.database
cd "$PROJECT_DIR"
echo ""

# ── Data directories ──────────────────────────────
mkdir -p data/resumes data/cover_letters data/logs
echo "   ✓ Data directories created"
echo ""

# ── Make scripts executable ───────────────────────
chmod +x scripts/*.sh
echo "   ✓ Scripts made executable"
echo ""

# ── Done ──────────────────────────────────────────
echo "============================================"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit config/settings.yaml with your Anthropic API key"
echo "  2. (Optional) Place your master resume at data/master_resume.pdf"
echo "  3. (Optional) Import existing tracking: python scripts/import_excel.py --file your_sheet.xlsx"
echo "  4. Start JobPilot: ./scripts/start.sh"
echo "  5. Open http://localhost:5173"
echo ""
echo "To schedule daily pipeline runs:"
echo "  crontab -e"
echo "  0 4 * * * $(pwd)/scripts/run_pipeline.sh >> data/logs/pipeline.log 2>&1"
echo "============================================"
