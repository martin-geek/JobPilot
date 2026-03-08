"""
JobPilot API
FastAPI application serving the dashboard and agent orchestration.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path

from backend.db.database import init_database
from backend.api.routers import jobs, dashboard, applications, companies, settings, pipeline, search_queries


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_database()
    yield


app = FastAPI(
    title="JobPilot",
    description="AI-Powered Career Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(search_queries.router, prefix="/api/search-queries", tags=["Search Queries"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "jobpilot"}
