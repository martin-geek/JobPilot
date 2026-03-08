"""
Settings Router
Read and update application settings.
"""

from fastapi import APIRouter
from backend.db.database import get_db

router = APIRouter()


@router.get("/")
async def get_all_settings():
    """Get all settings grouped by category."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM settings ORDER BY category, key"
        )
        rows = await cursor.fetchall()
        # Group by category
        grouped = {}
        for row in rows:
            cat = row["category"] or "general"
            if cat not in grouped:
                grouped[cat] = []
            grouped[cat].append(dict(row))
        return grouped


@router.put("/{key}")
async def update_setting(key: str, value: str):
    """Update a single setting."""
    async with get_db() as db:
        await db.execute("""
            UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
        """, (value, key))

        # Log the change
        await db.execute("""
            INSERT INTO activity_log (event_type, details)
            VALUES ('config_changed', ?)
        """, (f"Setting '{key}' updated to '{value}'",))

        return {"key": key, "value": value}
