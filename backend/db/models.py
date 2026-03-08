"""
JobPilot Data Models
Pydantic models for API request/response validation and serialization.
"""

from __future__ import annotations
from datetime import datetime, date
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


# ============================================================
# Enums
# ============================================================

class JobStatus(str, Enum):
    DISCOVERED = "discovered"
    ASSESSED = "assessed"
    QUEUED = "queued"
    APPLIED = "applied"
    SCREENING = "screening"
    PHONE_SCREEN = "phone_screen"
    INTERVIEW_1 = "interview_1"
    INTERVIEW_2 = "interview_2"
    INTERVIEW_FINAL = "interview_final"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    CLOSED = "closed"

class TriageCategory(str, Enum):
    STRONG_FIT = "strong_fit"
    STRETCH = "stretch"
    REVIEW = "review"
    DISCARD = "discard"

class LocationType(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"

class JobSource(str, Enum):
    LINKEDIN = "linkedin"
    INDEED = "indeed"
    GLASSDOOR = "glassdoor"
    DICE = "dice"
    BUILTIN = "builtin"
    COMPANY_PORTAL = "company_portal"
    MANUAL = "manual"

class SearchTier(str, Enum):
    PRIMARY = "primary"
    ADJACENT = "adjacent"
    OPPORTUNISTIC = "opportunistic"

class AssetType(str, Enum):
    RESUME = "resume"
    COVER_LETTER = "cover_letter"
    QA_DRAFT = "qa_draft"


# ============================================================
# Company Models
# ============================================================

class CompanyBase(BaseModel):
    name: str
    career_url: Optional[str] = None
    portal_type: Optional[str] = None
    industry: Optional[str] = None
    size_category: Optional[str] = None
    headquarters: Optional[str] = None
    culture_notes: Optional[str] = None
    comp_notes: Optional[str] = None
    priority: str = "normal"
    is_watchlist: bool = False

class CompanyCreate(CompanyBase):
    pass

class Company(CompanyBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Job Models
# ============================================================

class JobBase(BaseModel):
    title: str
    company_name: str
    location: Optional[str] = None
    location_type: Optional[LocationType] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = "USD"
    source: JobSource
    source_url: str
    description: Optional[str] = None
    posted_date: Optional[date] = None
    seniority: Optional[str] = None

class JobCreate(JobBase):
    external_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    detected_ats: Optional[str] = None
    raw_html: Optional[str] = None

class JobUpdate(BaseModel):
    status: Optional[JobStatus] = None
    notes: Optional[str] = None

class Job(JobBase):
    id: int
    external_id: Optional[str] = None
    fingerprint: str
    company_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: JobStatus
    discovered_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class JobWithAssessment(Job):
    """Job with its assessment data included."""
    assessment: Optional[Assessment] = None
    assets: list[ApplicationAsset] = []
    application: Optional[Application] = None


# ============================================================
# Assessment Models
# ============================================================

class AssessmentBase(BaseModel):
    fit_score: float = Field(ge=0, le=100)
    career_score: float = Field(ge=0, le=100)
    compensation_score: Optional[float] = Field(None, ge=0, le=100)
    culture_score: Optional[float] = Field(None, ge=0, le=100)
    confidence: float = Field(ge=0, le=100)
    triage_category: TriageCategory
    key_matches: Optional[str] = None  # JSON
    gaps: Optional[str] = None  # JSON
    dealbreakers: Optional[str] = None  # JSON
    risk_flags: Optional[str] = None  # JSON
    rationale: str
    recommended_action: str
    salary_estimate: Optional[float] = None
    salary_confidence: Optional[str] = None

class AssessmentCreate(AssessmentBase):
    job_id: int

class Assessment(AssessmentBase):
    id: int
    job_id: int
    assessed_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Application Models
# ============================================================

class ApplicationBase(BaseModel):
    status: str = "queued"
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_title: Optional[str] = None

class ApplicationCreate(ApplicationBase):
    job_id: int

class ApplicationUpdate(BaseModel):
    status: Optional[str] = None
    applied_date: Optional[date] = None
    response_date: Optional[date] = None
    offer_amount: Optional[float] = None
    offer_currency: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_title: Optional[str] = None

class Application(ApplicationBase):
    id: int
    job_id: int
    applied_date: Optional[date] = None
    response_date: Optional[date] = None
    offer_amount: Optional[float] = None
    offer_currency: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Application Asset Models
# ============================================================

class ApplicationAssetBase(BaseModel):
    asset_type: AssetType
    file_format: str
    notes: Optional[str] = None

class ApplicationAsset(ApplicationAssetBase):
    id: int
    job_id: int
    file_path: str
    version: int
    generated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Search Query Models
# ============================================================

class SearchQueryBase(BaseModel):
    tier: SearchTier
    keywords: str
    geography: Optional[str] = None
    seniority: Optional[str] = None
    source: str = "all"
    is_active: bool = True

class SearchQueryCreate(SearchQueryBase):
    pass

class SearchQuery(SearchQueryBase):
    id: int
    last_run_at: Optional[datetime] = None
    results_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# Agent Run Models
# ============================================================

class AgentRun(BaseModel):
    id: int
    run_id: str
    agent_name: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    roles_discovered: int = 0
    roles_assessed: int = 0
    roles_queued: int = 0
    roles_discarded: int = 0
    errors: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# Activity Log Models
# ============================================================

class ActivityLogEntry(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    job_id: Optional[int] = None
    agent_run_id: Optional[int] = None
    details: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# Salary & Market Models
# ============================================================

class SalaryDataPoint(BaseModel):
    id: int
    role_category: str
    geography: str
    source: str
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_median: Optional[float] = None
    currency: str = "USD"
    sample_size: int = 1
    collected_at: datetime

    class Config:
        from_attributes = True

class MarketInsight(BaseModel):
    id: int
    insight_type: str
    title: str
    description: str
    data: Optional[str] = None  # JSON
    relevance_score: Optional[float] = None
    actionable: bool = False
    generated_at: datetime
    valid_until: Optional[date] = None

    class Config:
        from_attributes = True


# ============================================================
# Dashboard / Aggregation Models
# ============================================================

class DashboardStats(BaseModel):
    """Summary stats for the dashboard header."""
    total_discovered: int = 0
    total_applied: int = 0
    total_interviewing: int = 0
    total_offers: int = 0
    total_rejected: int = 0
    total_queued: int = 0
    response_rate: float = 0.0
    avg_fit_score: float = 0.0
    today_queue_count: int = 0
    last_pipeline_run: Optional[datetime] = None

class PipelineStage(BaseModel):
    """Count of jobs at each pipeline stage."""
    stage: str
    count: int

class SalarySummary(BaseModel):
    """Aggregated salary data for a role/geography combo."""
    role_category: str
    geography: str
    avg_min: float
    avg_max: float
    avg_median: float
    sample_count: int
    currency: str = "USD"
    meets_threshold: bool = True

class MapDataPoint(BaseModel):
    """Job location data for map visualization."""
    job_id: int
    title: str
    company: str
    latitude: float
    longitude: float
    location_type: Optional[str] = None
    fit_score: Optional[float] = None
    status: str


# Forward reference resolution
JobWithAssessment.model_rebuild()
