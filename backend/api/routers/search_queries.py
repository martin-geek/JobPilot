"""
Search Queries Router
Manage the search matrix — what queries run on what sources.
"""

from fastapi import APIRouter, HTTPException
from backend.db.database import get_db
from backend.db.models import SearchQueryCreate

router = APIRouter()


@router.get("/")
async def list_search_queries(tier: str = None, active_only: bool = True):
    """List all configured search queries."""
    async with get_db() as db:
        conditions = []
        params = []
        if tier:
            conditions.append("tier = ?")
            params.append(tier)
        if active_only:
            conditions.append("is_active = 1")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        cursor = await db.execute(f"""
            SELECT * FROM search_queries {where}
            ORDER BY tier, keywords
        """, params)
        return [dict(row) for row in await cursor.fetchall()]


@router.post("/")
async def create_search_query(query: SearchQueryCreate):
    """Add a new search query to the matrix."""
    async with get_db() as db:
        cursor = await db.execute("""
            INSERT INTO search_queries (tier, keywords, geography, seniority, source, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (query.tier, query.keywords, query.geography,
              query.seniority, query.source, query.is_active))
        return {"id": cursor.lastrowid, "keywords": query.keywords}


@router.patch("/{query_id}/toggle")
async def toggle_search_query(query_id: int):
    """Toggle a search query active/inactive."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT is_active FROM search_queries WHERE id = ?", (query_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Search query not found")

        new_state = not row["is_active"]
        await db.execute(
            "UPDATE search_queries SET is_active = ? WHERE id = ?",
            (new_state, query_id)
        )
        return {"id": query_id, "is_active": new_state}


@router.delete("/{query_id}")
async def delete_search_query(query_id: int):
    """Remove a search query."""
    async with get_db() as db:
        await db.execute("DELETE FROM search_queries WHERE id = ?", (query_id,))
        return {"deleted": query_id}
