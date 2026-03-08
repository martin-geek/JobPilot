-- JobPilot Database Schema
-- SQLite with WAL mode for concurrent read/write

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- COMPANIES
-- Target companies and their career portal metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    career_url      TEXT,
    portal_type     TEXT,  -- workday, greenhouse, lever, icims, custom, unknown
    industry        TEXT,
    size_category   TEXT,  -- startup, mid, large, enterprise, fortune500
    headquarters    TEXT,
    culture_notes   TEXT,
    comp_notes      TEXT,
    priority        TEXT DEFAULT 'normal',  -- high, normal, low
    is_watchlist    BOOLEAN DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- JOBS
-- Every job role discovered by the system
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id     TEXT,        -- req ID from the posting if available
    fingerprint     TEXT NOT NULL UNIQUE, -- SHA256(title+company+location) for dedup
    title           TEXT NOT NULL,
    company_id      INTEGER REFERENCES companies(id),
    company_name    TEXT NOT NULL,  -- denormalized for convenience
    location        TEXT,
    location_type   TEXT,          -- remote, hybrid, onsite
    latitude        REAL,
    longitude       REAL,
    salary_min      REAL,
    salary_max      REAL,
    salary_currency TEXT DEFAULT 'USD',
    source          TEXT NOT NULL,  -- linkedin, indeed, glassdoor, dice, builtin, company_portal
    source_url      TEXT NOT NULL,
    description     TEXT,
    posted_date     DATE,
    discovered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATE,
    detected_ats    TEXT,          -- workday, greenhouse, lever, etc.
    seniority       TEXT,          -- entry, mid, senior, principal, director, vp
    status          TEXT DEFAULT 'discovered',
    -- Status flow: discovered -> assessed -> queued -> applied -> screening -> interview -> offer -> accepted/rejected/withdrawn/closed
    raw_html        TEXT,          -- full page HTML for debugging
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_discovered ON jobs(discovered_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);

-- ============================================================
-- ASSESSMENTS
-- AI-generated evaluation of each role against the master resume
-- ============================================================
CREATE TABLE IF NOT EXISTS assessments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    fit_score           REAL NOT NULL,       -- 0-100: how well resume matches
    career_score        REAL NOT NULL,       -- 0-100: strategic career value
    compensation_score  REAL,                -- 0-100: estimated comp vs threshold
    culture_score       REAL,                -- 0-100: culture/company attractiveness
    confidence          REAL NOT NULL,       -- 0-100: how confident the assessment is
    triage_category     TEXT NOT NULL,       -- strong_fit, stretch, review, discard
    key_matches         TEXT,                -- JSON: top matching qualifications
    gaps                TEXT,                -- JSON: missing qualifications
    dealbreakers        TEXT,                -- JSON: hard disqualifiers
    risk_flags          TEXT,                -- JSON: concerns worth noting
    rationale           TEXT NOT NULL,       -- human-readable explanation
    recommended_action  TEXT NOT NULL,       -- apply, review, skip, discard
    salary_estimate     REAL,               -- estimated salary if not in posting
    salary_confidence   TEXT,               -- high, medium, low, none
    assessed_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assessments_triage ON assessments(triage_category);
CREATE INDEX IF NOT EXISTS idx_assessments_fit ON assessments(fit_score);

-- ============================================================
-- APPLICATION_ASSETS
-- Generated resume variants and cover letters per role
-- ============================================================
CREATE TABLE IF NOT EXISTS application_assets (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    asset_type          TEXT NOT NULL,  -- resume, cover_letter, qa_draft
    file_path           TEXT NOT NULL,
    file_format         TEXT NOT NULL,  -- pdf, docx, md, txt
    version             INTEGER DEFAULT 1,
    generated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes               TEXT           -- what was customized
);

CREATE INDEX IF NOT EXISTS idx_assets_job ON application_assets(job_id);

-- ============================================================
-- APPLICATIONS
-- Tracking the full application lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'queued',
    -- queued, applied, screening, phone_screen, interview_1, interview_2, interview_final, offer, accepted, rejected, withdrawn, closed
    applied_date    DATE,
    response_date   DATE,
    interview_dates TEXT,       -- JSON array of dates
    offer_amount    REAL,
    offer_currency  TEXT,
    rejection_reason TEXT,
    notes           TEXT,
    contact_name    TEXT,
    contact_email   TEXT,
    contact_title   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- ============================================================
-- SEARCH_QUERIES
-- Configurable search matrix
-- ============================================================
CREATE TABLE IF NOT EXISTS search_queries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tier            TEXT NOT NULL,  -- primary, adjacent, opportunistic
    keywords        TEXT NOT NULL,  -- the search query string
    geography       TEXT,          -- US remote, Minneapolis, Madrid, EU remote, etc.
    seniority       TEXT,          -- senior, principal, director, vp
    source          TEXT,          -- linkedin, indeed, all
    is_active       BOOLEAN DEFAULT 1,
    last_run_at     TIMESTAMP,
    results_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- AGENT_RUNS
-- Audit log for every pipeline execution
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,     -- UUID for the pipeline run
    agent_name      TEXT NOT NULL,     -- discovery, assessment, tailoring, market_intel
    status          TEXT NOT NULL,     -- running, completed, failed, partial
    started_at      TIMESTAMP NOT NULL,
    completed_at    TIMESTAMP,
    roles_discovered INTEGER DEFAULT 0,
    roles_assessed  INTEGER DEFAULT 0,
    roles_queued    INTEGER DEFAULT 0,
    roles_discarded INTEGER DEFAULT 0,
    errors          TEXT,              -- JSON array of error messages
    log_path        TEXT,
    config_snapshot TEXT               -- JSON: settings used for this run
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_date ON agent_runs(started_at);

-- ============================================================
-- ACTIVITY_LOG
-- Every decision, status change, and event in the system
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type      TEXT NOT NULL,
    -- job_discovered, job_assessed, job_queued, job_discarded, job_applied,
    -- status_changed, asset_generated, manual_override, config_changed,
    -- agent_started, agent_completed, agent_failed
    job_id          INTEGER REFERENCES jobs(id),
    agent_run_id    INTEGER REFERENCES agent_runs(id),
    details         TEXT,              -- JSON: event-specific details
    old_value       TEXT,
    new_value       TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_job ON activity_log(job_id);

-- ============================================================
-- SALARY_DATA
-- Aggregated salary intelligence from postings and external sources
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_data (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role_category   TEXT NOT NULL,  -- Enterprise Architect, AI Lead, Director, etc.
    geography       TEXT NOT NULL,  -- Minneapolis, US Remote, Madrid, etc.
    source          TEXT NOT NULL,  -- posting, levels_fyi, glassdoor, manual
    salary_min      REAL,
    salary_max      REAL,
    salary_median   REAL,
    currency        TEXT DEFAULT 'USD',
    sample_size     INTEGER DEFAULT 1,
    collected_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_salary_role ON salary_data(role_category);
CREATE INDEX IF NOT EXISTS idx_salary_geo ON salary_data(geography);

-- ============================================================
-- MARKET_INSIGHTS
-- Weekly market intelligence snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS market_insights (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_type    TEXT NOT NULL,  -- skills_gap, trending_skill, role_recommendation, demand_shift
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    data            TEXT,          -- JSON: supporting data
    relevance_score REAL,         -- 0-100: how relevant to user's profile
    actionable      BOOLEAN DEFAULT 0,
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until     DATE          -- insights expire
);

-- ============================================================
-- SETTINGS
-- Key-value store for user preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    category        TEXT,         -- general, thresholds, schedule, search, salary
    description     TEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DEFAULT SETTINGS
-- ============================================================
INSERT OR IGNORE INTO settings (key, value, category, description) VALUES
    ('min_salary_us', '170000', 'salary', 'Minimum base salary threshold for US roles (USD)'),
    ('min_salary_spain', '70000', 'salary', 'Minimum base salary threshold for Spain roles (EUR)'),
    ('min_fit_score_apply', '80', 'thresholds', 'Minimum fit score for auto-queue to apply'),
    ('min_fit_score_review', '65', 'thresholds', 'Minimum fit score for manual review bucket'),
    ('min_career_score', '60', 'thresholds', 'Minimum career value score'),
    ('min_confidence_score', '70', 'thresholds', 'Minimum confidence score for auto-decisions'),
    ('daily_queue_target', '10', 'general', 'Target number of ready-to-apply roles per day'),
    ('discovery_cap', '150', 'general', 'Max raw roles to process per pipeline run'),
    ('freshness_days', '14', 'general', 'Only process roles posted within this many days'),
    ('pipeline_schedule', '0 4 * * *', 'schedule', 'Cron expression for daily pipeline run'),
    ('market_intel_schedule', '0 3 * * 0', 'schedule', 'Cron expression for weekly market intel (Sunday 3AM)'),
    ('anthropic_model_triage', 'claude-haiku-4-5-20251001', 'llm', 'Model for assessment/triage (cost-efficient)'),
    ('anthropic_model_generate', 'claude-sonnet-4-20250514', 'llm', 'Model for resume/cover letter generation (quality)');

-- ============================================================
-- DEFAULT SEARCH QUERIES
-- ============================================================
INSERT OR IGNORE INTO search_queries (tier, keywords, geography, seniority, source) VALUES
    -- Tier 1: Primary targets
    ('primary', 'Principal Enterprise Architect', 'US Remote', 'principal', 'all'),
    ('primary', 'Senior Enterprise Architect', 'US Remote', 'senior', 'all'),
    ('primary', 'Enterprise Architect', 'Minneapolis MN', 'senior', 'all'),
    ('primary', 'Solutions Architect Microsoft', 'US Remote', 'senior', 'all'),
    ('primary', 'Platform Architect', 'US Remote', 'principal', 'all'),
    ('primary', 'Enterprise Architect', 'Madrid Spain', 'senior', 'all'),
    ('primary', 'Enterprise Architect', 'Barcelona Spain', 'senior', 'all'),
    ('primary', 'Solutions Architect', 'EU Remote', 'senior', 'all'),

    -- Tier 2: Adjacent stretch roles
    ('adjacent', 'Director Digital Workplace', 'US Remote', 'director', 'all'),
    ('adjacent', 'Head of AI Enablement', 'US Remote', 'director', 'all'),
    ('adjacent', 'AI Governance Lead', 'US Remote', 'senior', 'all'),
    ('adjacent', 'Pre-Sales Solution Architect', 'US Remote', 'senior', 'all'),
    ('adjacent', 'Microsoft 365 Architect', 'US Remote', 'senior', 'all'),
    ('adjacent', 'Collaboration Platform Lead', 'US Remote', 'senior', 'all'),
    ('adjacent', 'Director Enterprise Platforms', 'US Remote', 'director', 'all'),
    ('adjacent', 'AI Strategy Lead', 'EU Remote', 'senior', 'all'),

    -- Tier 3: Opportunistic
    ('opportunistic', 'IT Director Enterprise', 'US Remote', 'director', 'all'),
    ('opportunistic', 'VP Enterprise Platforms', 'US Remote', 'vp', 'all'),
    ('opportunistic', 'Senior Consultant Enterprise Architecture', 'US Remote', 'senior', 'all'),
    ('opportunistic', 'Customer Success Architect', 'US Remote', 'senior', 'all');
