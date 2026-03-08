"""
Companies Router
Manage target companies and watchlist.
"""

from fastapi import APIRouter, HTTPException
from backend.db.database import get_db
from backend.db.models import CompanyCreate

router = APIRouter()


@router.get("/")
async def list_companies(watchlist_only: bool = False):
    """List all companies, optionally filtered to watchlist."""
    async with get_db() as db:
        where = "WHERE is_watchlist = 1" if watchlist_only else ""
        cursor = await db.execute(f"""
            SELECT c.*,
                   COUNT(j.id) as job_count,
                   SUM(CASE WHEN j.status = 'applied' THEN 1 ELSE 0 END) as applied_count
            FROM companies c
            LEFT JOIN jobs j ON j.company_id = c.id
            {where}
            GROUP BY c.id
            ORDER BY c.priority DESC, c.name
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.post("/")
async def create_company(company: CompanyCreate):
    """Add a new company to track."""
    async with get_db() as db:
        cursor = await db.execute("""
            INSERT INTO companies (name, career_url, portal_type, industry,
                                   size_category, headquarters, culture_notes,
                                   comp_notes, priority, is_watchlist)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (company.name, company.career_url, company.portal_type,
              company.industry, company.size_category, company.headquarters,
              company.culture_notes, company.comp_notes, company.priority,
              company.is_watchlist))
        return {"id": cursor.lastrowid, "name": company.name}


@router.patch("/{company_id}")
async def update_company(company_id: int, **kwargs):
    """Update company details."""
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM companies WHERE id = ?", (company_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        # Build dynamic update from provided fields
        fields = {k: v for k, v in kwargs.items() if v is not None}
        if fields:
            sets = ", ".join(f"{k} = ?" for k in fields)
            await db.execute(
                f"UPDATE companies SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (*fields.values(), company_id)
            )
        return {"updated": company_id}


@router.delete("/{company_id}")
async def delete_company(company_id: int):
    """Remove a company."""
    async with get_db() as db:
        await db.execute("DELETE FROM companies WHERE id = ?", (company_id,))
        return {"deleted": company_id}
