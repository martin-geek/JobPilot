"""
Jobs Router
CRUD operations for job records including archive, unavailable, and notes.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from pydantic import BaseModel
from backend.db.database import get_db
import json
from datetime import date

router = APIRouter()


class NoteRequest(BaseModel):
    notes: str

class OverrideRequest(BaseModel):
    new_category: str
    reason: str


@router.get("/")
async def list_jobs(
    status: Optional[str] = None,
    source: Optional[str] = None,
    triage: Optional[str] = None,
    min_fit: Optional[float] = None,
    search: Optional[str] = None,
    exclude_archived: bool = True,
    exclude_unavailable: bool = True,
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
        else:
            # By default exclude archived and unavailable
            excludes = []
            if exclude_archived:
                excludes.append("'archived'")
            if exclude_unavailable:
                excludes.append("'unavailable'")
            if excludes:
                conditions.append(f"j.status NOT IN ({','.join(excludes)})")

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
                a.recommended_action,
                app.notes as app_notes,
                app.applied_date
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            LEFT JOIN applications app ON j.id = app.job_id
            {where}
            ORDER BY j.updated_at DESC
            LIMIT ? OFFSET ?
        """, (*params, limit, offset))

        jobs = [dict(row) for row in await cursor.fetchall()]

        count_cursor = await db.execute(f"""
            SELECT COUNT(*) as total
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            {where}
        """, params)
        total = (await count_cursor.fetchone())["total"]

        return {"jobs": jobs, "total": total, "limit": limit, "offset": offset}


@router.get("/archived")
async def list_archived():
    """List archived roles."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT j.*, app.notes, app.updated_at as archived_at
            FROM jobs j
            LEFT JOIN applications app ON j.id = app.job_id
            WHERE j.status = 'archived'
            ORDER BY j.updated_at DESC
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.get("/unavailable")
async def list_unavailable():
    """List roles marked as no longer available."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT j.*, app.notes, app.updated_at as marked_at
            FROM jobs j
            LEFT JOIN applications app ON j.id = app.job_id
            WHERE j.status = 'unavailable'
            ORDER BY j.updated_at DESC
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.get("/{job_id}")
async def get_job(job_id: int):
    """Get a single job with full assessment, assets, and application data."""
    async with get_db() as db:
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
    """Update a job's status."""
    async with get_db() as db:
        cursor = await db.execute("SELECT status FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        old_status = job["status"]

        await db.execute(
            "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, job_id),
        )

        # Create/update application record
        if status == "applied":
            await db.execute("""
                INSERT INTO applications (job_id, status, applied_date, notes)
                VALUES (?, 'applied', date('now'), ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status = 'applied',
                    applied_date = COALESCE(applications.applied_date, date('now')),
                    notes = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE applications.notes END,
                    updated_at = CURRENT_TIMESTAMP
            """, (job_id, notes, notes, notes, notes))
        elif status in ('archived', 'unavailable'):
            await db.execute("""
                INSERT INTO applications (job_id, status, notes)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status = ?,
                    notes = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE applications.notes END,
                    updated_at = CURRENT_TIMESTAMP
            """, (job_id, status, notes, status, notes, notes, notes))
        else:
            await db.execute("""
                INSERT INTO applications (job_id, status)
                VALUES (?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (job_id, status, status))

        # Log the status change
        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, old_value, new_value, details)
            VALUES ('status_changed', ?, ?, ?, ?)
        """, (job_id, old_status, status, notes))

        return {"job_id": job_id, "old_status": old_status, "new_status": status}


@router.post("/{job_id}/notes")
async def add_note(job_id: int, body: NoteRequest):
    """Add or append a note to a job."""
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Job not found")

        # Get existing notes
        cursor = await db.execute("SELECT notes FROM applications WHERE job_id = ?", (job_id,))
        row = await cursor.fetchone()

        if row:
            existing = row["notes"] or ""
            new_notes = f"{existing}\n[{date.today()}] {body.notes}".strip() if existing else f"[{date.today()}] {body.notes}"
            await db.execute(
                "UPDATE applications SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?",
                (new_notes, job_id)
            )
        else:
            await db.execute("""
                INSERT INTO applications (job_id, status, notes)
                VALUES (?, (SELECT status FROM jobs WHERE id = ?), ?)
            """, (job_id, job_id, f"[{date.today()}] {body.notes}"))

        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, details)
            VALUES ('note_added', ?, ?)
        """, (job_id, body.notes))

        return {"job_id": job_id, "note": body.notes}


@router.post("/{job_id}/unarchive")
async def unarchive_job(job_id: int):
    """Restore an archived or unavailable job to 'queued' status."""
    async with get_db() as db:
        cursor = await db.execute("SELECT status FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        old_status = job["status"]
        await db.execute(
            "UPDATE jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,)
        )
        await db.execute("""
            UPDATE applications SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE job_id = ?
        """, (job_id,))

        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, old_value, new_value, details)
            VALUES ('status_changed', ?, ?, 'queued', 'Unarchived')
        """, (job_id, old_status))

        return {"job_id": job_id, "new_status": "queued"}


@router.post("/{job_id}/override")
async def override_triage(job_id: int, body: OverrideRequest):
    """Manually override a triage decision."""
    async with get_db() as db:
        await db.execute(
            "UPDATE assessments SET triage_category = ? WHERE job_id = ?",
            (body.new_category, job_id)
        )
        new_status = "queued" if body.new_category in ("strong_fit", "stretch") else "assessed"
        await db.execute(
            "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_status, job_id)
        )
        await db.execute("""
            INSERT INTO activity_log (event_type, job_id, new_value, details)
            VALUES ('manual_override', ?, ?, ?)
        """, (job_id, body.new_category, body.reason))

        return {"job_id": job_id, "new_category": body.new_category, "new_status": new_status}


@router.delete("/{job_id}")
async def delete_job(job_id: int):
    """Permanently delete a job."""
    async with get_db() as db:
        await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return {"deleted": job_id}
