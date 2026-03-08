"""
Pipeline Router
Trigger agent pipeline runs, manual imports, and real-time progress tracking.
"""

import uuid
import json
import hashlib
import asyncio
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from backend.db.database import get_db
from backend.config.settings import get_config

router = APIRouter()

# ── Pipeline state (in-memory for real-time progress) ────────
_pipeline_state = {
    "is_running": False,
    "run_id": None,
    "current_stage": None,      # discovery, dedup, assessment, tailoring
    "stage_progress": None,     # "12/50 roles assessed"
    "stages_completed": [],     # ["discovery", "dedup"]
    "started_at": None,
    "error": None,
}

STAGES = ["discovery", "dedup", "assessment", "tailoring"]


def _update_progress(stage: str, progress: str = None, completed: bool = False):
    """Update the in-memory pipeline progress state."""
    _pipeline_state["current_stage"] = stage
    _pipeline_state["stage_progress"] = progress
    if completed and stage not in _pipeline_state["stages_completed"]:
        _pipeline_state["stages_completed"].append(stage)


# ── Manual Import ────────────────────────────────────────────

class ManualImportRequest(BaseModel):
    title: str
    company: str
    url: Optional[str] = ""
    location: Optional[str] = ""
    location_type: Optional[str] = None
    description: Optional[str] = ""
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    source: str = "manual"
    run_assessment: bool = True


@router.post("/import")
async def manual_import(req: ManualImportRequest, background_tasks: BackgroundTasks):
    """Manually import a job and optionally run assessment."""
    fingerprint = hashlib.sha256(
        f"{req.title.lower().strip()}|{req.company.lower().strip()}|{(req.location or '').lower().strip()}".encode()
    ).hexdigest()[:32]

    async with get_db() as db:
        # Check duplicate
        cursor = await db.execute("SELECT id FROM jobs WHERE fingerprint = ?", (fingerprint,))
        existing = await cursor.fetchone()
        if existing:
            return {"status": "duplicate", "job_id": existing["id"],
                    "message": f"This role already exists (ID: {existing['id']})"}

        # Insert
        cursor = await db.execute("""
            INSERT INTO jobs (fingerprint, title, company_name, location, location_type,
                              source, source_url, description, salary_min, salary_max, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered')
        """, (fingerprint, req.title, req.company, req.location, req.location_type,
              req.source, req.url or "manual-import", req.description,
              req.salary_min, req.salary_max))
        job_id = cursor.lastrowid

        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, details)
            VALUES ('job_discovered', ?, 'Manual import')
        """, (job_id,))

    # Optionally run assessment in background
    if req.run_assessment:
        background_tasks.add_task(_assess_single_job, job_id)

    return {"status": "imported", "job_id": job_id, "will_assess": req.run_assessment}


@router.post("/import-url")
async def import_from_url(url: str, background_tasks: BackgroundTasks):
    """Import a job by fetching its URL and extracting content."""
    # This would use Playwright to fetch the page content
    # For now, create a placeholder that the user can fill in
    return {"status": "url_import_not_yet_implemented",
            "message": "URL import coming soon. Use the manual form to enter job details."}


async def _assess_single_job(job_id: int):
    """Run assessment on a single manually imported job."""
    try:
        config = get_config()
        if not config.llm.api_key:
            return

        from backend.agents.assessment import AssessmentAgent
        run_id = f"manual-{uuid.uuid4().hex[:8]}"
        agent = AssessmentAgent(run_id)
        agent.config = config

        # Run only on this one job
        from anthropic import Anthropic
        agent.client = Anthropic(api_key=config.llm.api_key)

        # Load resume
        from backend.agents.assessment import _load_resume, _resume_text
        import backend.agents.assessment as assess_mod
        if assess_mod._resume_text is None:
            assess_mod._resume_text = _load_resume()

        async with get_db() as db:
            cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            job = await cursor.fetchone()
            if not job:
                return

        job_dict = dict(job)
        assessment = await agent._assess_role(job_dict)
        await agent._store_assessment(job_id, assessment)

        # Update status
        new_status = agent._triage_to_status(assessment["triage_category"])
        async with get_db() as db:
            await db.execute(
                "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_status, job_id)
            )
            await db.execute("""
                INSERT INTO activity_log (event_type, job_id, details, new_value)
                VALUES ('job_assessed', ?, ?, ?)
            """, (job_id, f"Manual import assessed: fit={assessment['fit_score']}", new_status))

    except Exception as e:
        # Log error but don't crash
        async with get_db() as db:
            await db.execute("""
                INSERT INTO activity_log (event_type, job_id, details)
                VALUES ('agent_failed', ?, ?)
            """, (job_id, f"Assessment failed: {str(e)}"))


# ── Pipeline Execution ───────────────────────────────────────

@router.post("/run")
async def trigger_pipeline(background_tasks: BackgroundTasks):
    """Manually trigger a full pipeline run."""
    if _pipeline_state["is_running"]:
        return {"status": "already_running", "message": "A pipeline run is already in progress",
                "current_stage": _pipeline_state["current_stage"]}

    run_id = str(uuid.uuid4())
    background_tasks.add_task(_execute_pipeline, run_id)
    return {"status": "started", "run_id": run_id}


@router.get("/status")
async def pipeline_status():
    """Get current pipeline status with stage-level progress."""
    async with get_db() as db:
        # Last completed run
        cursor = await db.execute("""
            SELECT run_id, completed_at, roles_discovered, roles_assessed, roles_queued, roles_discarded
            FROM agent_runs
            WHERE status = 'completed' AND agent_name = 'tailoring'
            ORDER BY completed_at DESC LIMIT 1
        """)
        last_run = await cursor.fetchone()
        last_run = dict(last_run) if last_run else None

        # Get schedule from settings
        cursor = await db.execute("SELECT value FROM settings WHERE key = 'pipeline_schedule'")
        schedule_row = await cursor.fetchone()
        schedule = schedule_row["value"] if schedule_row else "0 4 * * *"

        # Recent runs for history
        cursor = await db.execute("""
            SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 10
        """)
        recent = [dict(row) for row in await cursor.fetchall()]

    return {
        "is_running": _pipeline_state["is_running"],
        "run_id": _pipeline_state["run_id"],
        "current_stage": _pipeline_state["current_stage"],
        "stage_progress": _pipeline_state["stage_progress"],
        "stages_completed": _pipeline_state["stages_completed"],
        "all_stages": STAGES,
        "started_at": _pipeline_state["started_at"],
        "error": _pipeline_state["error"],
        "last_completed_run": last_run,
        "schedule_cron": schedule,
        "recent_runs": recent,
    }


@router.post("/stop")
async def stop_pipeline():
    """Request pipeline stop (best effort — completes current stage)."""
    if _pipeline_state["is_running"]:
        _pipeline_state["error"] = "Stop requested by user"
        return {"status": "stop_requested"}
    return {"status": "not_running"}


async def _execute_pipeline(run_id: str):
    """Execute the full agent pipeline with progress tracking."""
    global _pipeline_state

    _pipeline_state = {
        "is_running": True,
        "run_id": run_id,
        "current_stage": None,
        "stage_progress": None,
        "stages_completed": [],
        "started_at": datetime.now().isoformat(),
        "error": None,
    }

    try:
        from backend.agents.discovery import DiscoveryAgent
        from backend.agents.assessment import AssessmentAgent
        from backend.agents.tailoring import TailoringAgent
        from backend.agents.dedup import DedupAgent

        # Phase 1: Discovery
        _update_progress("discovery", "Searching job sources...")
        discovery = DiscoveryAgent(run_id)
        await discovery.run()
        _update_progress("discovery", f"Found {discovery.stats['roles_discovered']} new roles", completed=True)

        # Check for stop request
        if _pipeline_state.get("error") == "Stop requested by user":
            raise Exception("Pipeline stopped by user")

        # Phase 2: Deduplication
        _update_progress("dedup", "Checking for duplicates...")
        dedup = DedupAgent(run_id)
        await dedup.run()
        _update_progress("dedup", f"Removed {dedup.stats['roles_discarded']} duplicates", completed=True)

        if _pipeline_state.get("error") == "Stop requested by user":
            raise Exception("Pipeline stopped by user")

        # Phase 3: Assessment
        _update_progress("assessment", "Scoring roles against your resume...")

        # Patch the assessment agent to report progress
        assessment = AssessmentAgent(run_id)
        original_execute = assessment.execute

        async def patched_execute():
            """Wrapped execute that updates progress as it goes."""
            # Count how many need assessment
            async with get_db() as db:
                cursor = await db.execute("""
                    SELECT COUNT(*) as c FROM jobs j
                    LEFT JOIN assessments a ON j.id = a.job_id
                    WHERE j.status = 'discovered' AND a.id IS NULL
                """)
                total = (await cursor.fetchone())["c"]

            if total == 0:
                _update_progress("assessment", "No new roles to assess", completed=True)
                return

            _update_progress("assessment", f"0/{total} roles assessed...")
            await original_execute()
            _update_progress("assessment",
                f"{assessment.stats['roles_assessed']}/{total} assessed, "
                f"{assessment.stats['roles_queued']} queued",
                completed=True)

        assessment.execute = patched_execute
        await assessment.run()

        if _pipeline_state.get("error") == "Stop requested by user":
            raise Exception("Pipeline stopped by user")

        # Phase 4: Tailoring
        _update_progress("tailoring", "Generating tailored resumes & cover letters...")
        tailoring = TailoringAgent(run_id)
        await tailoring.run()
        _update_progress("tailoring", "Documents ready", completed=True)

    except Exception as e:
        _pipeline_state["error"] = str(e)
        async with get_db() as db:
            await db.execute("""
                INSERT INTO agent_runs (run_id, agent_name, status, started_at, completed_at, errors)
                VALUES (?, 'pipeline', 'failed', ?, ?, ?)
            """, (run_id, _pipeline_state["started_at"], datetime.now().isoformat(), str(e)))
    finally:
        _pipeline_state["is_running"] = False
        _pipeline_state["current_stage"] = None
