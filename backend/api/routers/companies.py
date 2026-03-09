"""
Companies Router
Manage target companies with career portal discovery and job search.
"""

import hashlib
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from backend.db.database import get_db
from backend.config.settings import get_config
import logging

logger = logging.getLogger("jobpilot")
router = APIRouter()


class CompanyCreate(BaseModel):
    name: str
    career_url: Optional[str] = None
    portal_type: Optional[str] = None
    industry: Optional[str] = None
    size_category: Optional[str] = None
    headquarters: Optional[str] = None
    culture_notes: Optional[str] = None
    comp_notes: Optional[str] = None
    priority: str = "normal"
    is_watchlist: bool = True
    auto_search: bool = False  # Trigger career portal search on add


@router.get("/")
async def list_companies(watchlist_only: bool = False):
    async with get_db() as db:
        where = "WHERE is_watchlist = 1" if watchlist_only else ""
        cursor = await db.execute(f"""
            SELECT c.*,
                   COUNT(j.id) as job_count,
                   SUM(CASE WHEN j.status IN ('applied','screening','phone_screen',
                        'interview_1','interview_2','interview_final') THEN 1 ELSE 0 END) as active_count
            FROM companies c
            LEFT JOIN jobs j ON j.company_id = c.id
            {where}
            GROUP BY c.id
            ORDER BY c.priority DESC, c.name
        """)
        return [dict(row) for row in await cursor.fetchall()]


@router.post("/")
async def create_company(company: CompanyCreate, background_tasks: BackgroundTasks):
    async with get_db() as db:
        # Check if already exists
        cursor = await db.execute(
            "SELECT id FROM companies WHERE LOWER(name) = LOWER(?)", (company.name,))
        existing = await cursor.fetchone()
        if existing:
            return {"id": existing["id"], "name": company.name, "status": "already_exists"}

        cursor = await db.execute("""
            INSERT INTO companies (name, career_url, portal_type, industry,
                                   size_category, headquarters, culture_notes,
                                   comp_notes, priority, is_watchlist)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (company.name, company.career_url, company.portal_type,
              company.industry, company.size_category, company.headquarters,
              company.culture_notes, company.comp_notes, company.priority,
              company.is_watchlist))
        company_id = cursor.lastrowid

    # Auto-discover career portal and search for jobs
    if company.auto_search:
        background_tasks.add_task(_search_company_portal, company_id, company.name, company.career_url)

    return {"id": company_id, "name": company.name, "status": "created",
            "searching": company.auto_search}


@router.post("/{company_id}/search")
async def search_company_jobs(company_id: int, background_tasks: BackgroundTasks):
    """Trigger a job search on a company's career portal."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
        company = await cursor.fetchone()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

    background_tasks.add_task(
        _search_company_portal, company_id, company["name"], company["career_url"]
    )
    return {"status": "search_started", "company": company["name"]}


@router.get("/{company_id}/jobs")
async def get_company_jobs(company_id: int):
    """Get all jobs found for a specific company."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT j.*, a.fit_score, a.triage_category
            FROM jobs j
            LEFT JOIN assessments a ON j.id = a.job_id
            WHERE j.company_id = ? AND j.status NOT IN ('archived', 'unavailable')
            ORDER BY j.discovered_at DESC
        """, (company_id,))
        return [dict(row) for row in await cursor.fetchall()]


@router.patch("/{company_id}")
async def update_company(company_id: int, name: Optional[str] = None,
                          career_url: Optional[str] = None,
                          priority: Optional[str] = None,
                          is_watchlist: Optional[bool] = None,
                          culture_notes: Optional[str] = None):
    async with get_db() as db:
        updates, params = [], []
        if name is not None: updates.append("name = ?"); params.append(name)
        if career_url is not None: updates.append("career_url = ?"); params.append(career_url)
        if priority is not None: updates.append("priority = ?"); params.append(priority)
        if is_watchlist is not None: updates.append("is_watchlist = ?"); params.append(is_watchlist)
        if culture_notes is not None: updates.append("culture_notes = ?"); params.append(culture_notes)
        if updates:
            params.append(company_id)
            await db.execute(
                f"UPDATE companies SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                params)
    return {"updated": company_id}


@router.delete("/{company_id}")
async def delete_company(company_id: int):
    async with get_db() as db:
        await db.execute("DELETE FROM companies WHERE id = ?", (company_id,))
    return {"deleted": company_id}


# ── Career Portal Discovery & Search ────────────────────────

# Common career portal URL patterns
CAREER_URL_PATTERNS = [
    "https://careers.{domain}",
    "https://{domain}/careers",
    "https://{domain}/jobs",
    "https://jobs.{domain}",
    "https://{company_slug}.greenhouse.io/",
    "https://boards.greenhouse.io/{company_slug}",
    "https://{company_slug}.lever.co/",
    "https://www.linkedin.com/company/{company_slug}/jobs/",
]


async def _search_company_portal(company_id: int, company_name: str, career_url: str = None):
    """Search a company's career portal for relevant roles.

    Strategy:
    1. If career_url provided, search there directly
    2. If not, try to discover it via common patterns
    3. Use Playwright to search for architect/AI/M365 roles
    4. Store found roles in the database
    """
    config = get_config()

    # Keywords to search for on career portals
    search_terms = [
        "architect", "enterprise architect", "solutions architect",
        "AI", "Microsoft 365", "M365", "platform", "director"
    ]

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright not installed — skipping company portal search")
        return

    found_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=config.scraping.headless)
        page = await browser.new_page(user_agent=config.scraping.user_agent)

        try:
            # If we have a career URL, use it
            if career_url:
                found_count = await _scrape_career_page(
                    page, career_url, company_id, company_name, search_terms, config
                )
            else:
                # Try to discover the career page
                discovered_url = await _discover_career_url(page, company_name)
                if discovered_url:
                    # Save the discovered URL
                    async with get_db() as db:
                        await db.execute(
                            "UPDATE companies SET career_url = ? WHERE id = ?",
                            (discovered_url, company_id)
                        )
                    found_count = await _scrape_career_page(
                        page, discovered_url, company_id, company_name, search_terms, config
                    )

        except Exception as e:
            logger.error(f"Company portal search failed for {company_name}: {e}")
        finally:
            await browser.close()

    # Log results
    async with get_db() as db:
        await db.execute("""
            INSERT INTO activity_log (event_type, details)
            VALUES ('job_discovered', ?)
        """, (f"Company search: {company_name} — found {found_count} roles",))


async def _discover_career_url(page, company_name: str) -> Optional[str]:
    """Try to discover a company's career page URL."""
    import asyncio

    # Try Google search for career page
    search_query = f"{company_name} careers jobs"
    try:
        await page.goto(
            f"https://www.google.com/search?q={search_query.replace(' ', '+')}",
            wait_until="domcontentloaded", timeout=15000
        )
        await asyncio.sleep(2)

        # Look for career page links in results
        links = await page.query_selector_all("a[href]")
        for link in links[:20]:
            href = await link.get_attribute("href")
            if href and any(kw in href.lower() for kw in ["/careers", "/jobs", "greenhouse.io", "lever.co", "workday"]):
                if company_name.lower().split()[0] in href.lower():
                    return href

    except Exception as e:
        logger.debug(f"Career URL discovery failed for {company_name}: {e}")

    return None


async def _scrape_career_page(page, url: str, company_id: int, company_name: str,
                                search_terms: list, config) -> int:
    """Scrape a career page for relevant job listings."""
    import asyncio

    found_count = 0

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(3)

        # Try to find a search input and search for relevant terms
        search_input = await page.query_selector(
            'input[type="search"], input[type="text"][placeholder*="search" i], '
            'input[name*="search" i], input[aria-label*="search" i], '
            'input[placeholder*="job" i], input[placeholder*="keyword" i]'
        )

        if search_input:
            # Search for key terms
            for term in search_terms[:3]:  # Limit searches
                try:
                    await search_input.fill("")
                    await search_input.fill(term)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(3)

                    # Extract job listings from results
                    count = await _extract_job_listings(page, company_id, company_name, url)
                    found_count += count

                    await asyncio.sleep(config.scraping.rate_limit_seconds)
                except Exception:
                    continue
        else:
            # No search box — try to extract all visible job listings
            found_count = await _extract_job_listings(page, company_id, company_name, url)

    except Exception as e:
        logger.error(f"Error scraping {url}: {e}")

    return found_count


async def _extract_job_listings(page, company_id: int, company_name: str, base_url: str) -> int:
    """Extract job listings from the current page state."""
    count = 0

    # Common selectors for job listing links across various career platforms
    selectors = [
        'a[href*="/job/"]', 'a[href*="/position/"]', 'a[href*="/posting/"]',
        'a[href*="/careers/"]', 'a[href*="/opportunity/"]',
        '.job-title a', '.job-listing a', '.posting-title a',
        '[data-automation="job-link"]', '.job-card a',
        'a[class*="job"]', 'a[class*="position"]',
    ]

    seen_titles = set()

    for selector in selectors:
        try:
            links = await page.query_selector_all(selector)
            for link in links[:30]:
                try:
                    title = (await link.inner_text()).strip()
                    href = await link.get_attribute("href")

                    if not title or len(title) < 5 or title in seen_titles:
                        continue
                    seen_titles.add(title)

                    # Filter for relevant roles
                    title_lower = title.lower()
                    relevant_terms = ["architect", "ai ", "microsoft", "m365", "director",
                                     "platform", "enterprise", "solutions", "principal",
                                     "cloud", "security", "governance", "365"]
                    if not any(t in title_lower for t in relevant_terms):
                        continue

                    # Build full URL
                    if href and not href.startswith("http"):
                        from urllib.parse import urljoin
                        href = urljoin(base_url, href)

                    fingerprint = hashlib.sha256(
                        f"{title.lower()}|{company_name.lower()}|".encode()
                    ).hexdigest()[:32]

                    async with get_db() as db:
                        cursor = await db.execute(
                            "SELECT id FROM jobs WHERE fingerprint = ?", (fingerprint,))
                        if await cursor.fetchone():
                            continue

                        await db.execute("""
                            INSERT INTO jobs (fingerprint, title, company_name, company_id,
                                            source, source_url, status)
                            VALUES (?, ?, ?, ?, 'company_portal', ?, 'discovered')
                        """, (fingerprint, title, company_name, company_id, href or base_url))
                        count += 1

                except Exception:
                    continue
        except Exception:
            continue

    return count
