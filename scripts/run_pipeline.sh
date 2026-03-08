#!/bin/bash
# JobPilot Pipeline Runner
# Schedule this with cron: 0 4 * * * /path/to/jobpilot/scripts/run_pipeline.sh
#
# This script runs the full agent pipeline:
# 1. Discovery — scrape job sources
# 2. Dedup — remove duplicates
# 3. Assessment — score and triage
# 4. Tailoring — generate documents

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/data/logs"
LOG_FILE="$LOG_DIR/pipeline_$(date +%Y%m%d_%H%M%S).log"

mkdir -p "$LOG_DIR"

echo "======================================" | tee -a "$LOG_FILE"
echo "JobPilot Pipeline - $(date)" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"

cd "$PROJECT_DIR"

# Activate virtual environment
if [ -f "backend/venv/bin/activate" ]; then
    source backend/venv/bin/activate
fi

# Run the pipeline via API
echo "[$(date +%H:%M:%S)] Triggering pipeline..." | tee -a "$LOG_FILE"

RESPONSE=$(curl -s -X POST http://localhost:8000/api/pipeline/run)
echo "API Response: $RESPONSE" | tee -a "$LOG_FILE"

# Wait for completion (poll status)
MAX_WAIT=1800  # 30 minutes max
ELAPSED=0
INTERVAL=30

while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))

    STATUS=$(curl -s http://localhost:8000/api/pipeline/status | python3 -c "import sys,json; print(json.load(sys.stdin)['is_running'])" 2>/dev/null || echo "unknown")

    if [ "$STATUS" = "False" ] || [ "$STATUS" = "false" ]; then
        echo "[$(date +%H:%M:%S)] Pipeline completed after ${ELAPSED}s" | tee -a "$LOG_FILE"
        break
    fi

    echo "[$(date +%H:%M:%S)] Pipeline still running (${ELAPSED}s elapsed)..." | tee -a "$LOG_FILE"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "[$(date +%H:%M:%S)] WARNING: Pipeline exceeded max wait time" | tee -a "$LOG_FILE"
fi

echo "======================================" | tee -a "$LOG_FILE"
echo "Pipeline run complete" | tee -a "$LOG_FILE"

# Cleanup old logs (keep last 30 days)
find "$LOG_DIR" -name "pipeline_*.log" -mtime +30 -delete 2>/dev/null || true
