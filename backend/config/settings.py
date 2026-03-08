"""
JobPilot Configuration
Loads settings from YAML config file and environment variables.
"""

import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


CONFIG_DIR = Path(__file__).parent.parent.parent / "config"
CONFIG_FILE = CONFIG_DIR / "settings.yaml"


@dataclass
class LLMConfig:
    api_key: str = ""
    triage_model: str = "claude-haiku-4-5-20251001"
    generate_model: str = "claude-sonnet-4-20250514"
    max_tokens_triage: int = 1500
    max_tokens_generate: int = 4000

@dataclass
class SalaryConfig:
    min_us: float = 170000.0
    min_spain: float = 70000.0
    currency_us: str = "USD"
    currency_spain: str = "EUR"

@dataclass
class ThresholdConfig:
    min_fit_score_apply: float = 80.0
    min_fit_score_review: float = 65.0
    min_career_score: float = 60.0
    min_confidence_score: float = 70.0

@dataclass
class PipelineConfig:
    daily_queue_target: int = 10
    discovery_cap: int = 150
    freshness_days: int = 14
    schedule_cron: str = "0 4 * * *"
    market_intel_cron: str = "0 3 * * 0"

@dataclass
class ScrapingConfig:
    headless: bool = True
    rate_limit_seconds: float = 3.0
    max_retries: int = 3
    user_agent: str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    linkedin_session_cookie: str = ""  # li_at cookie value

@dataclass
class AppConfig:
    """Root configuration object."""
    llm: LLMConfig = field(default_factory=LLMConfig)
    salary: SalaryConfig = field(default_factory=SalaryConfig)
    thresholds: ThresholdConfig = field(default_factory=ThresholdConfig)
    pipeline: PipelineConfig = field(default_factory=PipelineConfig)
    scraping: ScrapingConfig = field(default_factory=ScrapingConfig)
    master_resume_path: str = "data/master_resume.pdf"
    data_dir: str = "data"
    log_level: str = "INFO"


def load_config() -> AppConfig:
    """Load configuration from YAML file, with env var overrides."""
    config = AppConfig()

    # Load from YAML if exists
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            raw = yaml.safe_load(f) or {}

        if "llm" in raw:
            config.llm = LLMConfig(**{k: v for k, v in raw["llm"].items() if hasattr(LLMConfig, k)})
        if "salary" in raw:
            config.salary = SalaryConfig(**{k: v for k, v in raw["salary"].items() if hasattr(SalaryConfig, k)})
        if "thresholds" in raw:
            config.thresholds = ThresholdConfig(**{k: v for k, v in raw["thresholds"].items() if hasattr(ThresholdConfig, k)})
        if "pipeline" in raw:
            config.pipeline = PipelineConfig(**{k: v for k, v in raw["pipeline"].items() if hasattr(PipelineConfig, k)})
        if "scraping" in raw:
            config.scraping = ScrapingConfig(**{k: v for k, v in raw["scraping"].items() if hasattr(ScrapingConfig, k)})

        config.master_resume_path = raw.get("master_resume_path", config.master_resume_path)
        config.data_dir = raw.get("data_dir", config.data_dir)
        config.log_level = raw.get("log_level", config.log_level)

    # Environment variable overrides (highest priority)
    if api_key := os.environ.get("ANTHROPIC_API_KEY"):
        config.llm.api_key = api_key
    if li_cookie := os.environ.get("LINKEDIN_SESSION_COOKIE"):
        config.scraping.linkedin_session_cookie = li_cookie

    return config


# Singleton config instance
_config: Optional[AppConfig] = None

def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config
