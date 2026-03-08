"""
Tailoring Agent
Generates customized resumes and cover letters for roles that passed triage.
Uses Claude Sonnet for quality — approximately $0.02-0.05 per generation.

Only runs for roles in 'queued' status that don't already have assets.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from anthropic import Anthropic
from backend.agents.base import BaseAgent
from backend.db.database import get_db
from backend.config.settings import get_config

logger = logging.getLogger("jobpilot")

RESUME_TAILORING_PROMPT = """You are an expert resume writer specializing in senior technology leadership roles. Your task is to tailor a candidate's master resume to a specific job posting.

## Master Resume
{resume}

## Target Role
Title: {title}
Company: {company}
Location: {location}
Description:
{description}

## Assessment Context
Fit Score: {fit_score}/100
Key Matches: {key_matches}
Gaps: {gaps}
Rationale: {rationale}

## Instructions
Create a tailored version of the resume that:
1. Reorders and emphasizes bullet points most relevant to this specific role
2. Adjusts the Executive Summary to align with the role's key requirements
3. Highlights matching competencies in the Core Competencies section
4. Preserves all factual content — do NOT invent experience or fabricate details
5. Keeps the same overall structure and formatting approach
6. Addresses gaps by emphasizing transferable experience where possible
7. Optimizes for ATS keyword matching based on the job description

Output the tailored resume in Markdown format, maintaining professional formatting.
Start directly with the resume content — no preamble or explanation."""


COVER_LETTER_PROMPT = """You are an expert cover letter writer for senior technology leaders. Write a compelling, personalized cover letter.

## Candidate Resume (Summary)
{resume_summary}

## Target Role
Title: {title}
Company: {company}
Location: {location}
Description:
{description}

## Assessment Context
Key Matches: {key_matches}
Career Value: {rationale}

## Instructions
Write a professional cover letter that:
1. Opens with a compelling hook connecting the candidate to this specific role
2. Highlights 2-3 strongest qualifications that directly match the role
3. Addresses one transferable strength that compensates for any gaps
4. Demonstrates knowledge of the company and genuine interest
5. Closes with a confident call to action
6. Maintains a tone that is executive but approachable — not generic
7. Length: 3-4 paragraphs, no more than 350 words

Output ONLY the cover letter text. No headers or metadata."""


class TailoringAgent(BaseAgent):
    """Generates tailored application materials for queued roles."""

    def __init__(self, run_id: str):
        super().__init__(run_id, "tailoring")
        self.client = None
        self.resume_text = None

    async def execute(self):
        """Generate tailored materials for all queued roles without assets."""
        config = get_config()
        if not config.llm.api_key:
            raise ValueError("Anthropic API key not configured")

        self.client = Anthropic(api_key=config.llm.api_key)

        # Load master resume
        resume_path = Path(config.master_resume_path)
        if resume_path.suffix == ".pdf":
            import fitz
            doc = fitz.open(str(resume_path))
            self.resume_text = "\n".join(page.get_text() for page in doc)
            doc.close()
        else:
            self.resume_text = resume_path.read_text()

        # Get queued roles that need tailoring
        async with get_db() as db:
            cursor = await db.execute("""
                SELECT j.*, a.fit_score, a.career_score, a.key_matches,
                       a.gaps, a.rationale, a.triage_category
                FROM jobs j
                JOIN assessments a ON j.id = a.job_id
                LEFT JOIN application_assets aa ON j.id = aa.job_id
                WHERE j.status = 'queued' AND aa.id IS NULL
                ORDER BY a.fit_score DESC
                LIMIT ?
            """, (config.pipeline.daily_queue_target,))
            jobs = [dict(row) for row in await cursor.fetchall()]

        if not jobs:
            logger.info("No queued jobs need tailoring")
            return

        logger.info(f"Tailoring materials for {len(jobs)} roles")

        data_dir = Path(config.data_dir)
        resumes_dir = data_dir / "resumes"
        letters_dir = data_dir / "cover_letters"
        resumes_dir.mkdir(parents=True, exist_ok=True)
        letters_dir.mkdir(parents=True, exist_ok=True)

        for job in jobs:
            try:
                # Generate tailored resume
                resume_md = await self._generate_resume(job)
                resume_filename = (
                    f"resume_{job['id']}_{job['company_name'].replace(' ', '_')}"
                    f"_{datetime.now().strftime('%Y%m%d')}.md"
                )
                resume_path = resumes_dir / resume_filename
                resume_path.write_text(resume_md)

                # Store resume asset
                async with get_db() as db:
                    await db.execute("""
                        INSERT INTO application_assets
                            (job_id, asset_type, file_path, file_format, notes)
                        VALUES (?, 'resume', ?, 'md', ?)
                    """, (job["id"], str(resume_path),
                          f"Tailored for {job['title']} at {job['company_name']}"))

                # Generate cover letter
                cover_letter = await self._generate_cover_letter(job)
                letter_filename = (
                    f"cover_{job['id']}_{job['company_name'].replace(' ', '_')}"
                    f"_{datetime.now().strftime('%Y%m%d')}.md"
                )
                letter_path = letters_dir / letter_filename
                letter_path.write_text(cover_letter)

                # Store cover letter asset
                async with get_db() as db:
                    await db.execute("""
                        INSERT INTO application_assets
                            (job_id, asset_type, file_path, file_format, notes)
                        VALUES (?, 'cover_letter', ?, 'md', ?)
                    """, (job["id"], str(letter_path),
                          f"Cover letter for {job['title']} at {job['company_name']}"))

                await self.log_activity(
                    "asset_generated", job["id"],
                    f"Generated resume and cover letter"
                )

                logger.info(
                    f"Tailored materials for: {job['title']} @ {job['company_name']}"
                )

            except Exception as e:
                logger.error(f"Error tailoring job {job['id']}: {e}")
                self.errors.append(f"Job {job['id']}: {e}")

    async def _generate_resume(self, job: dict) -> str:
        """Generate a tailored resume using Claude Sonnet."""
        key_matches = job.get("key_matches", "[]")
        if isinstance(key_matches, str):
            try:
                key_matches = json.loads(key_matches)
            except json.JSONDecodeError:
                key_matches = []

        gaps = job.get("gaps", "[]")
        if isinstance(gaps, str):
            try:
                gaps = json.loads(gaps)
            except json.JSONDecodeError:
                gaps = []

        prompt = RESUME_TAILORING_PROMPT.format(
            resume=self.resume_text,
            title=job.get("title", ""),
            company=job.get("company_name", ""),
            location=job.get("location", ""),
            description=job.get("description", "No description available"),
            fit_score=job.get("fit_score", "N/A"),
            key_matches=", ".join(key_matches) if key_matches else "N/A",
            gaps=", ".join(gaps) if gaps else "None identified",
            rationale=job.get("rationale", ""),
        )

        response = self.client.messages.create(
            model=self.config.llm.generate_model,
            max_tokens=self.config.llm.max_tokens_generate,
            messages=[{"role": "user", "content": prompt}],
        )

        return response.content[0].text

    async def _generate_cover_letter(self, job: dict) -> str:
        """Generate a cover letter using Claude Sonnet."""
        # Use first ~1000 chars of resume as summary for context
        resume_summary = self.resume_text[:2000] if self.resume_text else ""

        key_matches = job.get("key_matches", "[]")
        if isinstance(key_matches, str):
            try:
                key_matches = json.loads(key_matches)
            except json.JSONDecodeError:
                key_matches = []

        prompt = COVER_LETTER_PROMPT.format(
            resume_summary=resume_summary,
            title=job.get("title", ""),
            company=job.get("company_name", ""),
            location=job.get("location", ""),
            description=job.get("description", "No description available"),
            key_matches=", ".join(key_matches) if key_matches else "N/A",
            rationale=job.get("rationale", ""),
        )

        response = self.client.messages.create(
            model=self.config.llm.generate_model,
            max_tokens=self.config.llm.max_tokens_generate,
            messages=[{"role": "user", "content": prompt}],
        )

        return response.content[0].text
