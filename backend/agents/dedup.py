"""
Dedup Agent
Identifies and removes duplicate job postings using:
1. Exact fingerprint matching (already handled at insert time)
2. Fuzzy matching for reposts with slightly different titles/formatting

This agent runs AFTER discovery and BEFORE assessment to avoid
wasting LLM calls on duplicates.
"""

import logging
from difflib import SequenceMatcher
from backend.agents.base import BaseAgent
from backend.db.database import get_db

logger = logging.getLogger("jobpilot")

# Similarity threshold for fuzzy matching (0.0-1.0)
FUZZY_THRESHOLD = 0.85


class DedupAgent(BaseAgent):
    """Detects near-duplicate job postings using fuzzy matching."""

    def __init__(self, run_id: str):
        super().__init__(run_id, "dedup")

    async def execute(self):
        """Find and mark fuzzy duplicates among newly discovered roles."""
        async with get_db() as db:
            # Get newly discovered jobs (not yet assessed)
            cursor = await db.execute("""
                SELECT id, title, company_name, location, description
                FROM jobs WHERE status = 'discovered'
                ORDER BY discovered_at DESC
            """)
            new_jobs = [dict(row) for row in await cursor.fetchall()]

            if not new_jobs:
                logger.info("No new jobs to dedup")
                return

            # Get existing jobs (already assessed or further in pipeline)
            cursor = await db.execute("""
                SELECT id, title, company_name, location, description
                FROM jobs WHERE status != 'discovered'
            """)
            existing_jobs = [dict(row) for row in await cursor.fetchall()]

            logger.info(
                f"Dedup: checking {len(new_jobs)} new jobs against "
                f"{len(existing_jobs)} existing"
            )

            duplicates_found = 0

            for new_job in new_jobs:
                is_dup, dup_of = self._find_fuzzy_match(new_job, existing_jobs)

                if is_dup:
                    duplicates_found += 1
                    # Mark as closed with reference to the original
                    await db.execute("""
                        UPDATE jobs SET status = 'closed',
                        updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (new_job["id"],))

                    await self.log_activity(
                        "job_discarded", new_job["id"],
                        f"Fuzzy duplicate of job #{dup_of}",
                        new_value="closed"
                    )
                    self.stats["roles_discarded"] += 1

            logger.info(f"Dedup complete: {duplicates_found} duplicates found")

    def _find_fuzzy_match(self, job: dict, existing: list) -> tuple:
        """Check if a job is a fuzzy duplicate of any existing job.

        Compares title + company similarity. If both are very similar
        (same company, near-identical title), it's likely a repost.
        """
        for existing_job in existing:
            # Same company check (case-insensitive)
            company_sim = SequenceMatcher(
                None,
                job["company_name"].lower(),
                existing_job["company_name"].lower()
            ).ratio()

            if company_sim < 0.9:
                continue  # Different companies, skip

            # Title similarity
            title_sim = SequenceMatcher(
                None,
                job["title"].lower(),
                existing_job["title"].lower()
            ).ratio()

            if title_sim >= FUZZY_THRESHOLD:
                return True, existing_job["id"]

            # If titles are somewhat similar, check description overlap
            if title_sim >= 0.7 and job.get("description") and existing_job.get("description"):
                # Compare first 500 chars of description
                desc_sim = SequenceMatcher(
                    None,
                    job["description"][:500].lower(),
                    existing_job["description"][:500].lower()
                ).ratio()

                if desc_sim >= FUZZY_THRESHOLD:
                    return True, existing_job["id"]

        return False, None
