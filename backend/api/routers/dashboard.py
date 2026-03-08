"""
Dashboard Router
Serves aggregated data for the main dashboard views.
"""

from fastapi import APIRouter
from backend.db.database import get_db
import json

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats():
    """Get summary statistics for the dashboard header."""
    async with get_db() as db:
        stats = {}

        # Total counts by status
        cursor = await db.execute("""
            SELECT status, COUNT(*) as count FROM jobs GROUP BY status
        """)
        status_counts = {row["status"]: row["count"] for row in await cursor.fetchall()}

        stats["total_discovered"] = sum(status_counts.values())
        stats["total_applied"] = sum(
            status_counts.get(s, 0) for s in
            ["applied", "screening", "phone_screen", "interview_1",
             "interview_2", "interview_final", "offer", "accepted", "rejected"]
        )
        stats["total_interviewing"] = sum(
            status_counts.get(s, 0) for s in
            ["screening", "phone_screen", "interview_1", "interview_2", "interview_final"]
        )
        stats["total_offers"] = status_counts.get("offer", 0) + status_counts.get("accepted", 0)
        stats["total_rejected"] = status_counts.get("rejected", 0) + status_counts.get("closed", 0)
        stats["total_queued"] = status_counts.get("queued", 0)

        # Response rate
        applied = stats["total_applied"]
        responded = stats["total_interviewing"] + stats["total_offers"] + stats["total_rejected"]
        stats["response_rate"] = round((responded / applied * 100) if applied > 0 else 0, 1)

        # Average fit score for applied roles
        cursor = await db.execute("""
            SELECT AVG(a.fit_score) as avg_fit
            FROM assessments a
            JOIN jobs j ON j.id = a.job_id
            WHERE j.status NOT IN ('discovered', 'assessed')
        """)
        row = await cursor.fetchone()
        stats["avg_fit_score"] = round(row["avg_fit"] or 0, 1)

        # Today's queue count
        cursor = await db.execute("""
            SELECT COUNT(*) as count FROM jobs WHERE status = 'queued'
        """)
        stats["today_queue_count"] = (await cursor.fetchone())["count"]

        # Last pipeline run
        cursor = await db.execute("""
            SELECT completed_at FROM agent_runs
            WHERE status = 'completed'
            ORDER BY completed_at DESC LIMIT 1
        """)
        row = await cursor.fetchone()
        stats["last_pipeline_run"] = row["completed_at"] if row else None

        return stats


@router.get("/queue")
async def get_morning_queue():
    """Get the morning queue — roles ready to apply, sorted by fit score."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT
                j.*,
                a.fit_score,
                a.career_score,
                a.compensation_score,
                a.culture_score,
                a.confidence,
                a.triage_category,
                a.rationale,
                a.recommended_action,
                a.key_matches,
                a.gaps,
                a.risk_flags,
                a.salary_estimate,
                a.salary_confidence
            FROM jobs j
            JOIN assessments a ON j.id = a.job_id
            WHERE j.status = 'queued'
            ORDER BY a.fit_score DESC, a.career_score DESC
            LIMIT 15
        """)
        rows = await cursor.fetchall()

        queue = []
        for row in rows:
            job = dict(row)
            # Parse JSON fields
            for field in ["key_matches", "gaps", "risk_flags"]:
                if job.get(field):
                    try:
                        job[field] = json.loads(job[field])
                    except (json.JSONDecodeError, TypeError):
                        pass

            # Get associated assets
            asset_cursor = await db.execute("""
                SELECT * FROM application_assets WHERE job_id = ?
            """, (job["id"],))
            job["assets"] = [dict(a) for a in await asset_cursor.fetchall()]

            queue.append(job)

        return queue


@router.get("/pipeline")
async def get_pipeline_stages():
    """Get job counts by pipeline stage for Kanban view."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT status, COUNT(*) as count
            FROM jobs
            GROUP BY status
            ORDER BY
                CASE status
                    WHEN 'discovered' THEN 1
                    WHEN 'assessed' THEN 2
                    WHEN 'queued' THEN 3
                    WHEN 'applied' THEN 4
                    WHEN 'screening' THEN 5
                    WHEN 'phone_screen' THEN 6
                    WHEN 'interview_1' THEN 7
                    WHEN 'interview_2' THEN 8
                    WHEN 'interview_final' THEN 9
                    WHEN 'offer' THEN 10
                    WHEN 'accepted' THEN 11
                    WHEN 'rejected' THEN 12
                    WHEN 'withdrawn' THEN 13
                    WHEN 'closed' THEN 14
                END
        """)
        return [{"stage": row["status"], "count": row["count"]} for row in await cursor.fetchall()]


@router.get("/salary-summary")
async def get_salary_summary():
    """Get aggregated salary intelligence by role category and geography."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT
                role_category,
                geography,
                currency,
                AVG(salary_min) as avg_min,
                AVG(salary_max) as avg_max,
                AVG(salary_median) as avg_median,
                SUM(sample_size) as total_samples
            FROM salary_data
            GROUP BY role_category, geography, currency
            ORDER BY role_category, geography
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.get("/map-data")
async def get_map_data():
    """Get job locations for the geographic map view."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT
                j.id as job_id,
                j.title,
                j.company_name as company,
                j.latitude,
                j.longitude,
                j.location_type,
                j.location,
                j.status,
                a.fit_score
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            WHERE j.latitude IS NOT NULL AND j.longitude IS NOT NULL
            ORDER BY j.discovered_at DESC
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.get("/market-insights")
async def get_market_insights():
    """Get current market intelligence insights."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT * FROM market_insights
            WHERE valid_until IS NULL OR valid_until >= date('now')
            ORDER BY relevance_score DESC, generated_at DESC
            LIMIT 20
        """)
        rows = await cursor.fetchall()
        insights = []
        for row in rows:
            insight = dict(row)
            if insight.get("data"):
                try:
                    insight["data"] = json.loads(insight["data"])
                except (json.JSONDecodeError, TypeError):
                    pass
            insights.append(insight)
        return insights


@router.get("/activity")
async def get_recent_activity(limit: int = 50):
    """Get recent activity log entries."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT
                al.*,
                j.title as job_title,
                j.company_name
            FROM activity_log al
            LEFT JOIN jobs j ON al.job_id = j.id
            ORDER BY al.timestamp DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in await cursor.fetchall()]
