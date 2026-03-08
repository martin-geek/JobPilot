#!/bin/bash
# JobPilot - Start both backend and frontend servers
# Usage: ./scripts/start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🧭 Starting JobPilot..."
echo ""

cd "$PROJECT_DIR"

# Check Python venv
if [ ! -f "backend/venv/bin/activate" ]; then
    echo "❌ Python virtual environment not found."
    echo "   Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Check node_modules
if [ ! -d "frontend/node_modules" ]; then
    echo "❌ Frontend dependencies not installed."
    echo "   Run: cd frontend && npm install"
    exit 1
fi

# Check config
if [ ! -f "config/settings.yaml" ]; then
    echo "⚠️  No config/settings.yaml found. Copying example..."
    cp config/settings.example.yaml config/settings.yaml
    echo "   Edit config/settings.yaml with your Anthropic API key."
fi

# Start backend
echo "🔧 Starting backend (FastAPI on :8000)..."
cd backend
source venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd "$PROJECT_DIR"

# Wait for backend to be ready
echo "   Waiting for backend..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "   ✓ Backend ready"
        break
    fi
    sleep 1
done

# Start frontend
echo "🎨 Starting frontend (Vite on :5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd "$PROJECT_DIR"

echo ""
echo "✅ JobPilot is running!"
echo "   Dashboard: http://localhost:5173"
echo "   API:       http://localhost:8000/docs"
echo ""
echo "   Press Ctrl+C to stop both servers."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'JobPilot stopped.'" EXIT

# Wait for either to exit
wait
