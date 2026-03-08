"""
Assessment Agent
Uses Claude API to evaluate each discovered role against the master resume.
Produces fit scores, career alignment, and triage recommendations.

Uses Haiku for cost-efficient triage — approximately $0.002-0.005 per evaluation.
"""

import json
import logging
from pathlib import Path
from anthropic import Anthropic
from backend.agents.base import BaseAgent
from backend.db.database import get_db
from backend.config.settings import get_config

logger = logging.getLogger("jobpilot")

# Master resume text (loaded once at agent init)
_resume_text: str | None = None


def _load_resume() -> str:
    """Load the master resume text. Supports PDF and text formats."""
    config = get_config()
    resume_path = Path(config.master_resume_path)

    if not resume_path.exists():
        raise FileNotFoundError(
            f"Master resume not found at {resume_path}. "
            f"Place your resume at {config.master_resume_path}"
        )

    if resume_path.suffix == ".pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(resume_path))
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        except ImportError:
            raise ImportError("PyMuPDF (fitz) required for PDF resume. pip install pymupdf")
    else:
        return resume_path.read_text()


ASSESSMENT_PROMPT = """You are an expert career advisor and recruitment analyst. Your task is to evaluate a job posting against a candidate's resume and provide a structured assessment.

## Candidate Resume
{resume}

## Job Posting
Title: {title}
Company: {company}
Location: {location}
Description:
{description}

## Salary Context
- Candidate's minimum threshold (US): $170,000 USD
- Candidate's minimum threshold (Spain): €70,000 EUR
- Posted salary range: {salary_info}

## Evaluation Criteria

Score each dimension from 0-100:

1. **fit_score**: How well does the candidate's experience match the role requirements? Consider: technical skills match, years of experience, industry alignment, seniority level appropriateness.

2. **career_score**: Is this role strategically good for the candidate's career trajectory? Consider: does it advance toward Principal/Director-level enterprise architecture or AI enablement leadership? Is it a step up, lateral, or step down?

3. **compensation_score**: Based on the posted salary (if available) or your estimate for this role/location, how does it compare to the candidate's threshold? 100 = well above threshold, 50 = at threshold, 0 = well below.

4. **culture_score**: Based on the job description language, company reputation, and role structure, how attractive is the culture and work environment? Look for red flags (toxic language, unrealistic expectations) and green flags (growth mindset, innovation focus).

5. **confidence**: How confident are you in this assessment? Lower if the job description is vague or missing key information.

## Triage Rules
- **strong_fit**: fit_score >= 80 AND career_score >= 60 AND no dealbreakers
- **stretch**: fit_score 65-79 AND career_score >= 55
- **review**: fit_score 50-64 OR has interesting characteristics worth human review
- **discard**: fit_score < 50 OR has dealbreakers OR compensation clearly below threshold

## Response Format
Respond ONLY with valid JSON, no markdown fences:
{{
    "fit_score": <number>,
    "career_score": <number>,
    "compensation_score": <number>,
    "culture_score": <number>,
    "confidence": <number>,
    "triage_category": "<strong_fit|stretch|review|discard>",
    "key_matches": ["<top 3-5 matching qualifications>"],
    "gaps": ["<missing qualifications or concerns>"],
    "dealbreakers": ["<hard disqualifiers, empty if none>"],
    "risk_flags": ["<concerns worth noting>"],
    "rationale": "<2-3 sentence summary of why this role is/isn't a good fit>",
    "recommended_action": "<apply|review|skip|discard>",
    "salary_estimate": <number or null>,
    "salary_confidence": "<high|medium|low|none>"
}}"""


class AssessmentAgent(BaseAgent):
    """Evaluates discovered roles using Claude API."""

    def __init__(self, run_id: str):
        super().__init__(run_id, "assessment")
        self.client = None

    async def execute(self):
        """Assess all newly discovered (and de-duped) roles."""
        global _resume_text

        config = get_config()
        if not config.llm.api_key:
            raise ValueError("Anthropic API key not configured")

        self.client = Anthropic(api_key=config.llm.api_key)

        # Load resume once
        if _resume_text is None:
            _resume_text = _load_resume()

        async with get_db() as db:
            # Get unassessed jobs
            cursor = await db.execute("""
                SELECT j.* FROM jobs j
                LEFT JOIN assessments a ON j.id = a.job_id
                WHERE j.status = 'discovered' AND a.id IS NULL
                ORDER BY j.discovered_at DESC
            """)
            jobs = [dict(row) for row in await cursor.fetchall()]

        if not jobs:
            logger.info("No jobs to assess")
            return

        logger.info(f"Assessing {len(jobs)} roles")

        for job in jobs:
            try:
                assessment = await self._assess_role(job)
                await self._store_assessment(job["id"], assessment)
                self.stats["roles_assessed"] += 1

                # Update job status based on triage
                new_status = self._triage_to_status(assessment["triage_category"])
                async with get_db() as db:
                    await db.execute(
                        "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (new_status, job["id"])
                    )

                if new_status == "queued":
                    self.stats["roles_queued"] += 1
                elif assessment["triage_category"] == "discard":
                    self.stats["roles_discarded"] += 1

                await self.log_activity(
                    "job_assessed", job["id"],
                    f"Fit: {assessment['fit_score']}, Triage: {assessment['triage_category']}",
                    new_value=new_status
                )

            except Exception as e:
                logger.error(f"Error assessing job {job['id']}: {e}")
                self.errors.append(f"Job {job['id']}: {e}")

    async def _assess_role(self, job: dict) -> dict:
        """Call Claude API to assess a single role."""
        salary_info = "Not disclosed"
        if job.get("salary_min") and job.get("salary_max"):
            currency = job.get("salary_currency", "USD")
            salary_info = f"{currency} {job['salary_min']:,.0f} - {job['salary_max']:,.0f}"
        elif job.get("salary_min"):
            salary_info = f"{job.get('salary_currency', 'USD')} {job['salary_min']:,.0f}+"

        prompt = ASSESSMENT_PROMPT.format(
            resume=_resume_text,
            title=job.get("title", "Unknown"),
            company=job.get("company_name", "Unknown"),
            location=job.get("location", "Not specified"),
            description=job.get("description", "No description available"),
            salary_info=salary_info,
        )

        response = self.client.messages.create(
            model=self.config.llm.triage_model,
            max_tokens=self.config.llm.max_tokens_triage,
            messages=[{"role": "user", "content": prompt}],
        )

        # Parse JSON response
        text = response.content[0].text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        return json.loads(text)

    async def _store_assessment(self, job_id: int, assessment: dict):
        """Store assessment results in the database."""
        async with get_db() as db:
            await db.execute("""
                INSERT INTO assessments
                    (job_id, fit_score, career_score, compensation_score,
                     culture_score, confidence, triage_category,
                     key_matches, gaps, dealbreakers, risk_flags,
                     rationale, recommended_action,
                     salary_estimate, salary_confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                job_id,
                assessment["fit_score"],
                assessment["career_score"],
                assessment.get("compensation_score"),
                assessment.get("culture_score"),
                assessment["confidence"],
                assessment["triage_category"],
                json.dumps(assessment.get("key_matches", [])),
                json.dumps(assessment.get("gaps", [])),
                json.dumps(assessment.get("dealbreakers", [])),
                json.dumps(assessment.get("risk_flags", [])),
                assessment["rationale"],
                assessment["recommended_action"],
                assessment.get("salary_estimate"),
                assessment.get("salary_confidence"),
            ))

            # Store salary data if estimated
            if assessment.get("salary_estimate"):
                # Determine geography from job location
                # Simple heuristic — refine as needed
                location = ""
                cursor = await db.execute(
                    "SELECT location FROM jobs WHERE id = ?", (job_id,)
                )
                row = await cursor.fetchone()
                if row:
                    location = row["location"] or ""

                geography = "US Remote"
                if any(x in location.lower() for x in ["spain", "madrid", "barcelona", "valencia"]):
                    geography = "Spain"
                elif "minneapolis" in location.lower() or "mn" in location.lower():
                    geography = "Minneapolis"
                elif "remote" in location.lower():
                    geography = "US Remote"

                cursor = await db.execute(
                    "SELECT title FROM jobs WHERE id = ?", (job_id,)
                )
                title_row = await cursor.fetchone()
                role_cat = self._categorize_role(title_row["title"] if title_row else "")

                await db.execute("""
                    INSERT INTO salary_data
                        (role_category, geography, source, salary_min, salary_max,
                         salary_median, currency)
                    VALUES (?, ?, 'estimate', ?, ?, ?, ?)
                """, (
                    role_cat, geography,
                    assessment["salary_estimate"] * 0.9,
                    assessment["salary_estimate"] * 1.1,
                    assessment["salary_estimate"],
                    "EUR" if "Spain" in geography else "USD"
                ))

    @staticmethod
    def _triage_to_status(triage: str) -> str:
        """Map triage category to job status."""
        return {
            "strong_fit": "queued",
            "stretch": "queued",  # Stretches also get queued but ranked lower
            "review": "assessed",  # Stays in assessed for manual review
            "discard": "closed",
        }.get(triage, "assessed")

    @staticmethod
    def _categorize_role(title: str) -> str:
        """Categorize a role title into broad categories for salary tracking."""
        title_lower = title.lower()
        if "director" in title_lower or "vp" in title_lower or "head of" in title_lower:
            return "Director / VP"
        elif "principal" in title_lower:
            return "Principal Architect"
        elif "senior" in title_lower and "architect" in title_lower:
            return "Senior Architect"
        elif "architect" in title_lower:
            return "Architect"
        elif "consultant" in title_lower or "advisory" in title_lower:
            return "Consultant / Advisory"
        elif "manager" in title_lower or "lead" in title_lower:
            return "Engineering Manager / Lead"
        else:
            return "Other"
