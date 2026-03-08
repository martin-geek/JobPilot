# JobPilot 🧭

**AI-Powered Career Intelligence Platform**

Autonomous job discovery, assessment, and preparation pipeline with a modern dashboard. Automates everything except the final application submission — giving you efficiency without giving up control.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    JobPilot                          │
├──────────────┬──────────────┬───────────────────────┤
│   Agents     │   Backend    │      Frontend         │
│  (Python)    │  (FastAPI)   │      (React)          │
├──────────────┼──────────────┼───────────────────────┤
│ Discovery    │ REST API     │ Morning Queue         │
│ Assessment   │ SQLite DB    │ Pipeline Kanban       │
│ Tailoring    │ File Storage │ Salary Intelligence   │
│ Market Intel │ Scheduler    │ Job Map               │
│ Dedup        │              │ Market Intelligence   │
│ Audit        │              │ Settings & Logs       │
└──────────────┴──────────────┴───────────────────────┘
```

## Tech Stack

| Component        | Technology                         |
|------------------|------------------------------------|
| Backend API      | Python 3.11+ / FastAPI             |
| Database         | SQLite (via aiosqlite)             |
| Job Scraping     | Playwright (headless browser)      |
| LLM Engine       | Anthropic Claude API (Haiku/Sonnet)|
| Frontend         | React 18 + Vite + Tailwind CSS     |
| UI Components    | shadcn/ui                          |
| Maps             | Leaflet / React-Leaflet            |
| Charts           | Recharts                           |
| Scheduler        | APScheduler                        |
| Resume Gen       | python-docx + WeasyPrint           |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Anthropic API key

### 1. Clone & Setup

```bash
git clone https://github.com/YOUR_USERNAME/jobpilot.git
cd jobpilot

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Frontend
cd ../frontend
npm install
```

### 2. Configure

```bash
cp config/settings.example.yaml config/settings.yaml
# Edit config/settings.yaml with your API keys and preferences
```

### 3. Initialize Database

```bash
cd backend
python -m db.init_db
```

### 4. Import Existing Applications (Optional)

```bash
python scripts/import_excel.py --file path/to/your/tracking.xlsx
```

### 5. Run

```bash
# Terminal 1: Backend API
cd backend
uvicorn api.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

### 6. Schedule Daily Runs

```bash
# Add to crontab (macOS/Linux)
crontab -e

# Add this line to run pipeline at 4:00 AM daily
0 4 * * * cd /path/to/jobpilot && ./scripts/run_pipeline.sh >> data/logs/pipeline.log 2>&1
```

## Project Structure

```
jobpilot/
├── backend/
│   ├── agents/             # AI agents (discovery, assessment, tailoring, market intel)
│   │   ├── discovery.py    # Job source scraping
│   │   ├── assessment.py   # Role-resume fit scoring
│   │   ├── tailoring.py    # Resume/cover letter generation
│   │   ├── market_intel.py # Skills gap & trend analysis
│   │   ├── dedup.py        # Deduplication logic
│   │   └── base.py         # Base agent class
│   ├── api/
│   │   ├── main.py         # FastAPI application
│   │   └── routers/        # API route modules
│   ├── db/
│   │   ├── database.py     # Database connection & session management
│   │   ├── models.py       # SQLAlchemy/dataclass models
│   │   ├── schema.sql      # Raw SQL schema
│   │   └── init_db.py      # Database initialization
│   ├── services/           # Business logic layer
│   ├── config/             # Backend configuration
│   ├── templates/          # Document templates (resume, cover letter)
│   ├── utils/              # Shared utilities
│   └── tests/              # Test suite
├── frontend/
│   ├── src/
│   │   ├── components/     # React components by feature
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Frontend utilities
│   │   ├── styles/         # Global styles
│   │   └── pages/          # Page-level components
│   └── public/             # Static assets
├── config/
│   └── settings.yaml       # Main configuration file
├── data/
│   ├── resumes/            # Generated tailored resumes
│   ├── cover_letters/      # Generated cover letters
│   └── logs/               # Pipeline execution logs
├── scripts/                # Utility scripts
└── docs/                   # Documentation
```

## Configuration

See `config/settings.example.yaml` for all available options including:

- **Search Matrix**: Role keywords, geographies, seniority levels
- **Scoring Thresholds**: Minimum fit score, career value score
- **Compensation Floors**: Per-geography minimum salary thresholds
- **Queue Settings**: Max daily queue size, freshness window
- **Agent Schedule**: Cron expressions for pipeline stages
- **API Keys**: Anthropic API key

## Dashboard Views

1. **Morning Queue** — Today's top 8-10 roles ready to apply
2. **Pipeline** — Kanban board: Discovered → Assessed → Queued → Applied → Screening → Interview → Outcome
3. **Salary Intelligence** — Compensation ranges by role type and geography
4. **Job Map** — Geographic distribution with remote/hybrid/onsite breakdown
5. **Market Intelligence** — Skills gaps, trending demands, role recommendations
6. **Companies** — Watchlist and target company management
7. **Activity Log** — Full audit trail of all agent decisions
8. **Settings** — Search matrix, thresholds, schedule configuration

## Agent Pipeline

```
04:00 AM  ┌─────────────┐
          │  Discovery   │  Scrape all configured sources
          └──────┬───────┘
04:30 AM  ┌──────▼───────┐
          │  Dedup +     │  Fingerprint match + fuzzy dedup
          │  Assessment  │  LLM-based fit scoring
          └──────┬───────┘
05:00 AM  ┌──────▼───────┐
          │  Tailoring   │  Resume + cover letter for top roles
          └──────┬───────┘
05:30 AM  ┌──────▼───────┐
          │  Report      │  Compile morning summary
          └──────────────┘

Weekly:   ┌──────────────┐
          │ Market Intel │  Skills gaps, trends, recommendations
          └──────────────┘
```

## License

Private — Not for redistribution.
