"""
Discovery Agent
Scrapes configured job sources using Playwright headless browser.
Collects raw job postings and stores them in the database.

Sources supported:
- LinkedIn (via authenticated session)
- Indeed
- Glassdoor
- Dice
- Built In
- Company career portals (configurable)
"""

import hashlib
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from backend.agents.base import BaseAgent
from backend.db.database import get_db

logger = logging.getLogger("jobpilot")


def generate_fingerprint(title: str, company: str, location: str = "") -> str:
    """Generate a unique fingerprint for dedup.
    Uses SHA256 of normalized title + company + location.
    """
    raw = f"{title.lower().strip()}|{company.lower().strip()}|{location.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


class DiscoveryAgent(BaseAgent):
    """Scrapes job boards and career portals for new roles."""

    def __init__(self, run_id: str):
        super().__init__(run_id, "discovery")

    async def execute(self):
        """Run discovery across all active search queries and sources."""
        async with get_db() as db:
            # Load active search queries
            cursor = await db.execute(
                "SELECT * FROM search_queries WHERE is_active = 1"
            )
            queries = [dict(row) for row in await cursor.fetchall()]

        if not queries:
            logger.warning("No active search queries configured")
            return

        logger.info(f"Running {len(queries)} search queries")

        # Process each source
        for query in queries:
            source = query.get("source", "all")
            try:
                if source in ("all", "linkedin"):
                    await self._search_linkedin(query)
                if source in ("all", "indeed"):
                    await self._search_indeed(query)
                if source in ("all", "glassdoor"):
                    await self._search_glassdoor(query)
                if source in ("all", "dice"):
                    await self._search_dice(query)
                if source in ("all", "builtin"):
                    await self._search_builtin(query)
            except Exception as e:
                error_msg = f"Error searching {source} for '{query['keywords']}': {e}"
                logger.error(error_msg)
                self.errors.append(error_msg)

            # Check discovery cap
            if self.stats["roles_discovered"] >= self.config.pipeline.discovery_cap:
                logger.info(f"Discovery cap reached ({self.config.pipeline.discovery_cap})")
                break

            # Rate limiting between queries
            await asyncio.sleep(self.config.scraping.rate_limit_seconds)

    async def _store_job(self, title: str, company: str, location: str,
                          source: str, url: str, description: str = None,
                          posted_date: str = None, salary_min: float = None,
                          salary_max: float = None, location_type: str = None,
                          external_id: str = None, detected_ats: str = None,
                          raw_html: str = None) -> Optional[int]:
        """Store a discovered job if it doesn't already exist."""
        fingerprint = generate_fingerprint(title, company, location or "")

        async with get_db() as db:
            # Check for duplicate
            cursor = await db.execute(
                "SELECT id FROM jobs WHERE fingerprint = ?", (fingerprint,)
            )
            if await cursor.fetchone():
                logger.debug(f"Duplicate skipped: {title} @ {company}")
                return None

            # Insert new job
            cursor = await db.execute("""
                INSERT INTO jobs
                    (fingerprint, title, company_name, location, location_type,
                     source, source_url, description, posted_date,
                     salary_min, salary_max, external_id, detected_ats, raw_html,
                     status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered')
            """, (fingerprint, title, company, location, location_type,
                  source, url, description, posted_date,
                  salary_min, salary_max, external_id, detected_ats, raw_html))

            job_id = cursor.lastrowid
            self.stats["roles_discovered"] += 1

            # Link to company if exists
            co_cursor = await db.execute(
                "SELECT id FROM companies WHERE LOWER(name) = LOWER(?)", (company,)
            )
            co_row = await co_cursor.fetchone()
            if co_row:
                await db.execute(
                    "UPDATE jobs SET company_id = ? WHERE id = ?",
                    (co_row["id"], job_id)
                )

            await self.log_activity("job_discovered", job_id,
                                     f"Discovered from {source}: {title} @ {company}")

            return job_id

    # ── Source-specific scrapers ──────────────────────────────
    # Each method uses Playwright to search and extract job listings.
    # Implementation templates — customize per source's HTML structure.

    async def _search_linkedin(self, query: dict):
        """Search LinkedIn Jobs.

        NOTE: LinkedIn requires authentication. Uses the li_at session cookie
        from config. LinkedIn actively fights scraping — use conservative
        rate limits and human-like delays.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("Playwright not installed. Skipping LinkedIn.")
            return

        keywords = query["keywords"]
        geography = query.get("geography", "")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.config.scraping.headless)
            context = await browser.new_context(
                user_agent=self.config.scraping.user_agent
            )

            # Set LinkedIn session cookie if available
            if self.config.scraping.linkedin_session_cookie:
                await context.add_cookies([{
                    "name": "li_at",
                    "value": self.config.scraping.linkedin_session_cookie,
                    "domain": ".linkedin.com",
                    "path": "/",
                }])

            page = await context.new_page()

            try:
                # Build search URL
                search_url = (
                    f"https://www.linkedin.com/jobs/search/"
                    f"?keywords={keywords.replace(' ', '%20')}"
                    f"&location={geography.replace(' ', '%20')}"
                    f"&f_TPR=r604800"  # Past week
                    f"&sortBy=DD"  # Most recent
                )

                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)  # Human-like delay

                # Extract job cards
                # Note: LinkedIn's HTML structure changes frequently.
                # This selector pattern targets the job card list items.
                cards = await page.query_selector_all(".job-card-container")

                for card in cards[:20]:  # Limit per query
                    try:
                        title_el = await card.query_selector(".job-card-list__title")
                        company_el = await card.query_selector(".job-card-container__primary-description")
                        location_el = await card.query_selector(".job-card-container__metadata-item")
                        link_el = await card.query_selector("a.job-card-list__title")

                        title = await title_el.inner_text() if title_el else None
                        company = await company_el.inner_text() if company_el else None
                        location = await location_el.inner_text() if location_el else None
                        href = await link_el.get_attribute("href") if link_el else None

                        if title and company and href:
                            url = f"https://www.linkedin.com{href}" if href.startswith("/") else href
                            await self._store_job(
                                title=title.strip(),
                                company=company.strip(),
                                location=location.strip() if location else None,
                                source="linkedin",
                                url=url,
                            )
                    except Exception as e:
                        logger.debug(f"Error parsing LinkedIn card: {e}")

            except Exception as e:
                logger.error(f"LinkedIn search error: {e}")
                self.errors.append(f"LinkedIn: {e}")
            finally:
                await browser.close()

    async def _search_indeed(self, query: dict):
        """Search Indeed Jobs."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("Playwright not installed. Skipping Indeed.")
            return

        keywords = query["keywords"]
        geography = query.get("geography", "")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.config.scraping.headless)
            page = await browser.new_page(user_agent=self.config.scraping.user_agent)

            try:
                search_url = (
                    f"https://www.indeed.com/jobs"
                    f"?q={keywords.replace(' ', '+')}"
                    f"&l={geography.replace(' ', '+')}"
                    f"&fromage=14"  # Last 14 days
                    f"&sort=date"
                )

                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)

                # Indeed job card selectors
                cards = await page.query_selector_all(".job_seen_beacon, .resultContent")

                for card in cards[:20]:
                    try:
                        title_el = await card.query_selector("h2.jobTitle a, .jobTitle span")
                        company_el = await card.query_selector("[data-testid='company-name'], .companyName")
                        location_el = await card.query_selector("[data-testid='text-location'], .companyLocation")
                        link_el = await card.query_selector("h2.jobTitle a")
                        salary_el = await card.query_selector(".salary-snippet-container, .estimated-salary")

                        title = await title_el.inner_text() if title_el else None
                        company = await company_el.inner_text() if company_el else None
                        location = await location_el.inner_text() if location_el else None
                        href = await link_el.get_attribute("href") if link_el else None
                        salary_text = await salary_el.inner_text() if salary_el else None

                        salary_min, salary_max = self._parse_salary(salary_text)

                        if title and company:
                            url = f"https://www.indeed.com{href}" if href and href.startswith("/") else (href or "")
                            await self._store_job(
                                title=title.strip(),
                                company=company.strip(),
                                location=location.strip() if location else None,
                                source="indeed",
                                url=url,
                                salary_min=salary_min,
                                salary_max=salary_max,
                            )
                    except Exception as e:
                        logger.debug(f"Error parsing Indeed card: {e}")

            except Exception as e:
                logger.error(f"Indeed search error: {e}")
                self.errors.append(f"Indeed: {e}")
            finally:
                await browser.close()

    async def _search_glassdoor(self, query: dict):
        """Search Glassdoor Jobs. Similar pattern to Indeed."""
        # Glassdoor implementation follows same Playwright pattern
        # Selectors and URL structure differ
        logger.info(f"Glassdoor search: {query['keywords']} — placeholder")

    async def _search_dice(self, query: dict):
        """Search Dice.com (tech-focused)."""
        logger.info(f"Dice search: {query['keywords']} — placeholder")

    async def _search_builtin(self, query: dict):
        """Search Built In (tech companies)."""
        logger.info(f"Built In search: {query['keywords']} — placeholder")

    @staticmethod
    def _parse_salary(salary_text: str) -> tuple[Optional[float], Optional[float]]:
        """Extract min/max salary from text like '$150,000 - $200,000 a year'."""
        if not salary_text:
            return None, None

        import re
        numbers = re.findall(r'[\$€£]?([\d,]+(?:\.\d+)?)[kK]?', salary_text)
        if not numbers:
            return None, None

        values = []
        for n in numbers:
            val = float(n.replace(',', ''))
            # Handle "150K" format
            if val < 1000 and ('k' in salary_text.lower()):
                val *= 1000
            values.append(val)

        if len(values) >= 2:
            return min(values), max(values)
        elif len(values) == 1:
            return values[0], values[0]
        return None, None
