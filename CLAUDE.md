# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JobPilot is an AI-powered job discovery and application pipeline. It autonomously scrapes job boards, scores roles with Claude, and generates tailored resumes/cover letters, presenting a curated "morning queue" to the user each day.

## Development Commands

### Backend (Python/FastAPI)
```bash
cd backend
source venv/bin/activate

# Run dev server (port 8000)
uvicorn api.main:app --reload --port 8000

# Initialize/reset database
python -m db.init_db

# Run tests
pytest

# Run a single test file
pytest tests/test_agents.py

# Run pipeline manually (without scheduler)
python -m agents.pipeline
```

### Frontend (React/Vite)
```bash
cd frontend

# Dev server (port 5173, proxies /api → localhost:8000)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Start Both Servers
```bash
./scripts/start.sh
```

### Setup from Scratch
```bash
./scripts/setup.sh
# Then edit config/settings.yaml with your API keys
```

## Configuration

`config/settings.yaml` is the primary config file (copy from `config/settings.example.yaml`). Key settings:

- `llm.api_key` — Anthropic API key (or set `ANTHROPIC_API_KEY` env var)
- `llm.triage_model` — Claude Haiku for scoring (cheap)
- `llm.generate_model` — Claude Sonnet for resume/CL generation (quality)
- `thresholds.min_fit_score_apply` — score (0-100) above which jobs are auto-queued
- `scraping.linkedin_session_cookie` — required for LinkedIn scraping

Config is loaded via `backend/config/settings.py` as a singleton (`get_config()`), supporting YAML values overridden by env vars.

## Architecture

### Request Flow
```
React SPA (port 5173)
  → Vite proxy → FastAPI (port 8000)
    → Route handlers in backend/api/
      → Services/Agents (business logic)
        → aiosqlite (data/jobpilot.db)
          + Anthropic API (LLM calls)
          + Playwright (web scraping)
```

### Agent Pipeline
All agents inherit from `backend/agents/base.py` (`BaseAgent`), which handles run tracking, logging, and stats. The pipeline runs in this order:

1. **DiscoveryAgent** — Playwright-based scraping of LinkedIn, Indeed, Glassdoor, Dice, Built In, company portals. Generates SHA256 fingerprints for deduplication.
2. **DedupAgent** — Fingerprint matching + fuzzy text comparison to prevent duplicates.
3. **AssessmentAgent** — Claude Haiku scores each job on fit, career value, compensation, culture against the master resume.
4. **TailoringAgent** — Claude Sonnet generates tailored resume and cover letter for queued jobs.
5. **MarketIntelAgent** — Weekly analysis of skills gaps and market trends (runs Sundays).

Pipeline can be triggered via `POST /api/pipeline/run` (runs as a FastAPI background task) or scheduled via cron using `scripts/run_pipeline.sh`.

### Database
SQLite with WAL mode for concurrent reads. Schema defined in `backend/db/schema.sql`. Key tables:
- `jobs` — discovered roles with fingerprints and status (discovered → assessed → queued → applied → screening → interview → outcome)
- `assessments` — LLM-generated scores per job
- `application_assets` — generated resumes and cover letters
- `search_queries` — configurable search matrix (Primary/Adjacent/Opportunistic tiers)
- `agent_runs` + `activity_log` — full audit trail

Pydantic models live in `backend/db/models.py`. All DB access uses `aiosqlite` (async).

### API Layer
FastAPI app in `backend/api/main.py` includes 8 routers:
- `dashboard` — stats, morning queue, pipeline view, salary, map, market insights
- `jobs` — CRUD, status transitions, notes, archiving
- `applications` — lifecycle tracking
- `companies` — watchlist and targeted searches
- `search-queries` — search matrix configuration
- `settings` — user preferences (key-value store)
- `pipeline` — trigger runs, import jobs, extract from URL
- `health` — `GET /api/health`

### Frontend
React 18 SPA with React Router. `frontend/src/App.jsx` defines the fixed sidebar and all routes. All API calls go through `frontend/src/utils/api.js`. Key pages: QueuePage (morning queue), PipelinePage (Kanban), SalaryPage, MapPage (React-Leaflet), MarketPage (Recharts), CompaniesPage, SettingsPage.

## Git Workflow

- After completing any task, stage relevant files, write a clear commit message, and push to `origin/main`
- Commit messages must describe *what changed and why* (not vague labels like "updates")
- Never commit secrets, the SQLite DB (`data/jobpilot.db`), generated files, or `.DS_Store` — all covered by `.gitignore`
- Remote: `https://github.com/martin-geek/JobPilot.git`

## LLM Usage Pattern

- **Triage/scoring**: Claude Haiku (`claude-haiku-4-5-20251001`) — low cost, high volume
- **Generation**: Claude Sonnet — tailored documents per job, higher quality
- The master resume (`data/master_resume.pdf`) is the primary context for all LLM calls; it's loaded once and passed to assessment/tailoring prompts
