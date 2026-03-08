"""
Pipeline Router
Trigger agent pipeline runs and monitor execution.
"""

import uuid
import asyncio
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks
from backend.db.database import get_db

router = APIRouter()

# Track running pipelines
_running_pipeline = False


@router.post("/run")
async def trigger_pipeline(background_tasks: BackgroundTasks):
    """Manually trigger a full pipeline run."""
    global _running_pipeline
    if _running_pipeline:
        return {"status": "already_running", "message": "A pipeline run is already in progress"}

    run_id = str(uuid.uuid4())
    background_tasks.add_task(_execute_pipeline, run_id)
    return {"status": "started", "run_id": run_id}


@router.get("/status")
async def pipeline_status():
    """Get current pipeline status and recent runs."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT * FROM agent_runs
            ORDER BY started_at DESC
            LIMIT 10
        """)
        runs = [dict(row) for row in await cursor.fetchall()]
        return {
            "is_running": _running_pipeline,
            "recent_runs": runs
        }


@router.get("/runs/{run_id}")
async def get_pipeline_run(run_id: str):
    """Get details for a specific pipeline run."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM agent_runs WHERE run_id = ? ORDER BY started_at",
            (run_id,)
        )
        return [dict(row) for row in await cursor.fetchall()]


async def _execute_pipeline(run_id: str):
    """Execute the full agent pipeline.

    This is the main orchestration function that runs:
    1. Discovery agent — scrape job sources
    2. Dedup — filter duplicates
    3. Assessment agent — score and triage
    4. Tailoring agent — generate documents for top roles
    """
    global _running_pipeline
    _running_pipeline = True

    try:
        # Import agents here to avoid circular imports
        from backend.agents.discovery import DiscoveryAgent
        from backend.agents.assessment import AssessmentAgent
        from backend.agents.tailoring import TailoringAgent
        from backend.agents.dedup import DedupAgent

        # Phase 1: Discovery
        discovery = DiscoveryAgent(run_id)
        await discovery.run()

        # Phase 2: Deduplication
        dedup = DedupAgent(run_id)
        await dedup.run()

        # Phase 3: Assessment
        assessment = AssessmentAgent(run_id)
        await assessment.run()

        # Phase 4: Tailoring (only for roles that pass triage)
        tailoring = TailoringAgent(run_id)
        await tailoring.run()

    except Exception as e:
        # Log pipeline failure
        async with get_db() as db:
            await db.execute("""
                INSERT INTO agent_runs (run_id, agent_name, status, started_at, completed_at, errors)
                VALUES (?, 'pipeline', 'failed', ?, ?, ?)
            """, (run_id, datetime.now().isoformat(), datetime.now().isoformat(), str(e)))
    finally:
        _running_pipeline = False
