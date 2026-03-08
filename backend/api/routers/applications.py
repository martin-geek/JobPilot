"""
Applications Router
Manage application lifecycle and tracking.
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from backend.db.database import get_db

router = APIRouter()


@router.get("/")
async def list_applications(status: Optional[str] = None, limit: int = 50):
    """List all applications with job details."""
    async with get_db() as db:
        where = "WHERE app.status = ?" if status else ""
        params = [status] if status else []

        cursor = await db.execute(f"""
            SELECT
                app.*,
                j.title,
                j.company_name,
                j.source_url,
                j.location,
                j.location_type,
                a.fit_score,
                a.career_score
            FROM applications app
            JOIN jobs j ON app.job_id = j.id
            LEFT JOIN assessments a ON j.id = a.job_id
            {where}
            ORDER BY app.applied_date DESC
            LIMIT ?
        """, (*params, limit))
        return [dict(row) for row in await cursor.fetchall()]


@router.patch("/{application_id}")
async def update_application(application_id: int, status: Optional[str] = None,
                              notes: Optional[str] = None,
                              contact_name: Optional[str] = None,
                              contact_email: Optional[str] = None,
                              rejection_reason: Optional[str] = None):
    """Update application details."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM applications WHERE id = ?", (application_id,))
        app = await cursor.fetchone()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")

        updates = []
        params = []
        if status:
            updates.append("status = ?")
            params.append(status)
            # Sync job status
            await db.execute(
                "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (status, app["job_id"])
            )
        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)
        if contact_name is not None:
            updates.append("contact_name = ?")
            params.append(contact_name)
        if contact_email is not None:
            updates.append("contact_email = ?")
            params.append(contact_email)
        if rejection_reason is not None:
            updates.append("rejection_reason = ?")
            params.append(rejection_reason)

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(application_id)
            await db.execute(
                f"UPDATE applications SET {', '.join(updates)} WHERE id = ?",
                params
            )

        return {"updated": application_id}
