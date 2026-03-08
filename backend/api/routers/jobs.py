"""
Jobs Router
CRUD operations for job records.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from backend.db.database import get_db
import json

router = APIRouter()


@router.get("/")
async def list_jobs(
    status: Optional[str] = None,
    source: Optional[str] = None,
    triage: Optional[str] = None,
    min_fit: Optional[float] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    """List jobs with optional filters."""
    async with get_db() as db:
        conditions = []
        params = []

        if status:
            conditions.append("j.status = ?")
            params.append(status)
        if source:
            conditions.append("j.source = ?")
            params.append(source)
        if triage:
            conditions.append("a.triage_category = ?")
            params.append(triage)
        if min_fit:
            conditions.append("a.fit_score >= ?")
            params.append(min_fit)
        if search:
            conditions.append("(j.title LIKE ? OR j.company_name LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        cursor = await db.execute(f"""
            SELECT
                j.*,
                a.fit_score,
                a.career_score,
                a.triage_category,
                a.rationale,
                a.recommended_action
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            {where}
            ORDER BY j.discovered_at DESC
            LIMIT ? OFFSET ?
        """, (*params, limit, offset))

        jobs = [dict(row) for row in await cursor.fetchall()]

        # Get total count
        count_cursor = await db.execute(f"""
            SELECT COUNT(*) as total
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            {where}
        """, params)
        total = (await count_cursor.fetchone())["total"]

        return {"jobs": jobs, "total": total, "limit": limit, "offset": offset}


@router.get("/{job_id}")
async def get_job(job_id: int):
    """Get a single job with full assessment, assets, and application data."""
    async with get_db() as db:
        # Job details
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        result = dict(job)

        # Assessment
        cursor = await db.execute("SELECT * FROM assessments WHERE job_id = ?", (job_id,))
        assessment = await cursor.fetchone()
        if assessment:
            assessment = dict(assessment)
            for field in ["key_matches", "gaps", "dealbreakers", "risk_flags"]:
                if assessment.get(field):
                    try:
                        assessment[field] = json.loads(assessment[field])
                    except (json.JSONDecodeError, TypeError):
                        pass
            result["assessment"] = assessment

        # Assets
        cursor = await db.execute("SELECT * FROM application_assets WHERE job_id = ?", (job_id,))
        result["assets"] = [dict(a) for a in await cursor.fetchall()]

        # Application
        cursor = await db.execute("SELECT * FROM applications WHERE job_id = ?", (job_id,))
        app = await cursor.fetchone()
        result["application"] = dict(app) if app else None

        return result


@router.patch("/{job_id}/status")
async def update_job_status(job_id: int, status: str, notes: Optional[str] = None):
    """Update a job's status (e.g., mark as applied, rejected, etc.)."""
    async with get_db() as db:
        # Verify job exists
        cursor = await db.execute("SELECT status FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        old_status = job["status"]

        await db.execute(
            "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, job_id),
        )

        # If marking as applied, create/update application record
        if status == "applied":
            await db.execute("""
                INSERT INTO applications (job_id, status, applied_date)
                VALUES (?, 'applied', date('now'))
                ON CONFLICT(job_id) DO UPDATE SET
                    status = 'applied',
                    applied_date = date('now'),
                    updated_at = CURRENT_TIMESTAMP
            """, (job_id,))

        # Log the status change
        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, old_value, new_value, details)
            VALUES ('status_changed', ?, ?, ?, ?)
        """, (job_id, old_status, status, notes))

        return {"job_id": job_id, "old_status": old_status, "new_status": status}


@router.post("/{job_id}/override")
async def override_triage(job_id: int, new_category: str, reason: str):
    """Manually override a triage decision (e.g., move discarded role to queue)."""
    async with get_db() as db:
        # Update assessment
        await db.execute("""
            UPDATE assessments SET triage_category = ? WHERE job_id = ?
        """, (new_category, job_id))

        # Update job status based on new category
        new_status = "queued" if new_category in ("strong_fit", "stretch") else "assessed"
        await db.execute("""
            UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        """, (new_status, job_id))

        # Log override
        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, new_value, details)
            VALUES ('manual_override', ?, ?, ?)
        """, (job_id, new_category, reason))

        return {"job_id": job_id, "new_category": new_category, "new_status": new_status}


@router.delete("/{job_id}")
async def delete_job(job_id: int):
    """Delete a job and all associated records."""
    async with get_db() as db:
        await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return {"deleted": job_id}
