"""
Market Intelligence Agent
Runs weekly to analyze aggregate job data and produce strategic insights:
1. Skills gap analysis — what skills would unlock more roles
2. Trending demands — skills appearing with increasing frequency
3. Role recommendations — role types worth considering
4. Salary trends — compensation shifts by role/geography

Uses Claude Sonnet for analytical quality.
"""

import json
import logging
from datetime import datetime, timedelta
from anthropic import Anthropic
from backend.agents.base import BaseAgent
from backend.db.database import get_db
from backend.config.settings import get_config

logger = logging.getLogger("jobpilot")

MARKET_ANALYSIS_PROMPT = """You are a career market intelligence analyst specializing in enterprise technology leadership roles. Analyze the following job market data and produce strategic insights.

## Candidate Profile Summary
Principal Enterprise Architect with 25+ years of experience. Core strengths: Microsoft ecosystem (Azure, M365, Copilot), identity/security/governance, AI enablement, pre-sales advisory, executive engagement. Target roles: Principal/Director-level architecture, AI enablement, or enterprise platform leadership. Geographies: US (Minneapolis/Remote) and Spain (Madrid/Barcelona/Remote).

## Job Data Summary (Last 30 Days)
Total roles discovered: {total_discovered}
Roles assessed as strong fit: {strong_fit_count}
Roles assessed as stretch: {stretch_count}
Roles discarded: {discard_count}
Average fit score: {avg_fit}

## Most Common Skills in "Stretch" Roles (roles scoring 65-79)
These are roles where the candidate is close but missing something:
{stretch_skills}

## Most Common Skills Across All Roles
{all_skills}

## Role Title Distribution
{title_distribution}

## Geography Distribution
{geo_distribution}

## Salary Data
{salary_data}

## Analysis Required

Produce insights in the following JSON format:
{{
    "skills_gaps": [
        {{
            "skill": "<skill name>",
            "frequency_in_stretches": <percentage>,
            "effort_to_acquire": "<low|medium|high>",
            "potential_unlock": "<description of roles it would unlock>",
            "recommended_learning_path": "<brief recommendation>"
        }}
    ],
    "trending_skills": [
        {{
            "skill": "<skill name>",
            "trend_direction": "<rising|stable|declining>",
            "relevance_to_candidate": "<high|medium|low>",
            "note": "<brief context>"
        }}
    ],
    "role_recommendations": [
        {{
            "role_title": "<suggested role title to search for>",
            "rationale": "<why this is worth considering>",
            "estimated_salary_range": "<range>",
            "fit_probability": "<high|medium>"
        }}
    ],
    "market_observations": [
        "<2-3 high-level observations about the current market for this candidate>"
    ]
}}

Respond ONLY with valid JSON, no markdown fences."""


class MarketIntelAgent(BaseAgent):
    """Produces weekly market intelligence and skills gap analysis."""

    def __init__(self, run_id: str):
        super().__init__(run_id, "market_intel")
        self.client = None

    async def execute(self):
        """Analyze accumulated job data and generate insights."""
        config = get_config()
        if not config.llm.api_key:
            raise ValueError("Anthropic API key not configured")

        self.client = Anthropic(api_key=config.llm.api_key)

        # Gather data
        data = await self._gather_market_data()

        if data["total_discovered"] < 10:
            logger.info("Not enough data for market analysis (need 10+ roles)")
            return

        # Generate insights via LLM
        insights = await self._analyze(data)

        # Store insights
        await self._store_insights(insights)

        logger.info(
            f"Market intel complete: {len(insights.get('skills_gaps', []))} skill gaps, "
            f"{len(insights.get('role_recommendations', []))} role recommendations"
        )

    async def _gather_market_data(self) -> dict:
        """Aggregate job data for analysis."""
        async with get_db() as db:
            thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()

            # Basic counts
            cursor = await db.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN a.triage_category = 'strong_fit' THEN 1 ELSE 0 END) as strong,
                    SUM(CASE WHEN a.triage_category = 'stretch' THEN 1 ELSE 0 END) as stretch,
                    SUM(CASE WHEN a.triage_category = 'discard' THEN 1 ELSE 0 END) as discard,
                    AVG(a.fit_score) as avg_fit
                FROM jobs j
                LEFT JOIN assessments a ON j.id = a.job_id
                WHERE j.discovered_at >= ?
            """, (thirty_days_ago,))
            counts = dict(await cursor.fetchone())

            # Skills from stretch roles (gaps field)
            cursor = await db.execute("""
                SELECT a.gaps FROM assessments a
                JOIN jobs j ON j.id = a.job_id
                WHERE a.triage_category = 'stretch'
                AND j.discovered_at >= ?
            """, (thirty_days_ago,))
            stretch_gaps = []
            for row in await cursor.fetchall():
                if row["gaps"]:
                    try:
                        stretch_gaps.extend(json.loads(row["gaps"]))
                    except json.JSONDecodeError:
                        pass

            # Title distribution
            cursor = await db.execute("""
                SELECT title, COUNT(*) as count FROM jobs
                WHERE discovered_at >= ?
                GROUP BY title ORDER BY count DESC LIMIT 20
            """, (thirty_days_ago,))
            titles = [f"{row['title']}: {row['count']}" for row in await cursor.fetchall()]

            # Geography distribution
            cursor = await db.execute("""
                SELECT location, location_type, COUNT(*) as count FROM jobs
                WHERE discovered_at >= ?
                GROUP BY location, location_type ORDER BY count DESC LIMIT 15
            """, (thirty_days_ago,))
            geos = [
                f"{row['location']} ({row['location_type'] or 'unknown'}): {row['count']}"
                for row in await cursor.fetchall()
            ]

            # Salary data
            cursor = await db.execute("""
                SELECT role_category, geography, currency,
                       AVG(salary_median) as avg_median,
                       COUNT(*) as samples
                FROM salary_data
                WHERE collected_at >= ?
                GROUP BY role_category, geography
            """, (thirty_days_ago,))
            salary_rows = [
                f"{row['role_category']} in {row['geography']}: "
                f"{row['currency']} {row['avg_median']:,.0f} (n={row['samples']})"
                for row in await cursor.fetchall()
            ]

            return {
                "total_discovered": counts["total"] or 0,
                "strong_fit_count": counts["strong"] or 0,
                "stretch_count": counts["stretch"] or 0,
                "discard_count": counts["discard"] or 0,
                "avg_fit": round(counts["avg_fit"] or 0, 1),
                "stretch_skills": "\n".join(stretch_gaps[:30]) or "Insufficient data",
                "all_skills": "Extracted from job descriptions",
                "title_distribution": "\n".join(titles) or "No data",
                "geo_distribution": "\n".join(geos) or "No data",
                "salary_data": "\n".join(salary_rows) or "No data",
            }

    async def _analyze(self, data: dict) -> dict:
        """Send data to Claude for analysis."""
        prompt = MARKET_ANALYSIS_PROMPT.format(**data)

        response = self.client.messages.create(
            model=self.config.llm.generate_model,
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]

        return json.loads(text)

    async def _store_insights(self, insights: dict):
        """Store generated insights in the database."""
        valid_until = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")

        async with get_db() as db:
            # Skills gaps
            for gap in insights.get("skills_gaps", []):
                await db.execute("""
                    INSERT INTO market_insights
                        (insight_type, title, description, data, relevance_score,
                         actionable, valid_until)
                    VALUES ('skills_gap', ?, ?, ?, ?, 1, ?)
                """, (
                    f"Skills Gap: {gap['skill']}",
                    gap.get("potential_unlock", ""),
                    json.dumps(gap),
                    90 if gap.get("effort_to_acquire") == "low" else 70,
                    valid_until,
                ))

            # Trending skills
            for trend in insights.get("trending_skills", []):
                await db.execute("""
                    INSERT INTO market_insights
                        (insight_type, title, description, data, relevance_score,
                         actionable, valid_until)
                    VALUES ('trending_skill', ?, ?, ?, ?, 0, ?)
                """, (
                    f"Trending: {trend['skill']}",
                    trend.get("note", ""),
                    json.dumps(trend),
                    85 if trend.get("relevance_to_candidate") == "high" else 60,
                    valid_until,
                ))

            # Role recommendations
            for rec in insights.get("role_recommendations", []):
                await db.execute("""
                    INSERT INTO market_insights
                        (insight_type, title, description, data, relevance_score,
                         actionable, valid_until)
                    VALUES ('role_recommendation', ?, ?, ?, ?, 1, ?)
                """, (
                    f"Consider: {rec['role_title']}",
                    rec.get("rationale", ""),
                    json.dumps(rec),
                    80,
                    valid_until,
                ))

            # Market observations
            for obs in insights.get("market_observations", []):
                await db.execute("""
                    INSERT INTO market_insights
                        (insight_type, title, description, relevance_score, valid_until)
                    VALUES ('demand_shift', 'Market Observation', ?, 75, ?)
                """, (obs, valid_until))
