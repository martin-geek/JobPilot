"""
Base Agent
Common functionality for all JobPilot agents including logging,
database access, and run tracking.
"""

import logging
from datetime import datetime
from abc import ABC, abstractmethod
from backend.db.database import get_db
from backend.config.settings import get_config

logger = logging.getLogger("jobpilot")


class BaseAgent(ABC):
    """Base class for all pipeline agents."""

    def __init__(self, run_id: str, agent_name: str):
        self.run_id = run_id
        self.agent_name = agent_name
        self.config = get_config()
        self.started_at = None
        self.stats = {
            "roles_discovered": 0,
            "roles_assessed": 0,
            "roles_queued": 0,
            "roles_discarded": 0,
        }
        self.errors = []

    async def run(self):
        """Execute the agent with run tracking."""
        self.started_at = datetime.now()
        logger.info(f"[{self.agent_name}] Starting run {self.run_id}")

        try:
            await self._log_run_start()
            await self.execute()
            await self._log_run_complete("completed")
            logger.info(
                f"[{self.agent_name}] Completed. Stats: {self.stats}"
            )
        except Exception as e:
            self.errors.append(str(e))
            await self._log_run_complete("failed")
            logger.error(f"[{self.agent_name}] Failed: {e}", exc_info=True)
            raise

    @abstractmethod
    async def execute(self):
        """Implement the agent's core logic."""
        pass

    async def log_activity(self, event_type: str, job_id: int = None,
                           details: str = None, old_value: str = None,
                           new_value: str = None):
        """Log an activity event."""
        async with get_db() as db:
            await db.execute("""
                INSERT INTO activity_log
                    (event_type, job_id, agent_run_id, details, old_value, new_value)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (event_type, job_id, self.run_id, details, old_value, new_value))

    async def _log_run_start(self):
        """Record the start of an agent run."""
        async with get_db() as db:
            await db.execute("""
                INSERT INTO agent_runs (run_id, agent_name, status, started_at)
                VALUES (?, ?, 'running', ?)
            """, (self.run_id, self.agent_name, self.started_at.isoformat()))

    async def _log_run_complete(self, status: str):
        """Record the completion of an agent run."""
        import json
        async with get_db() as db:
            await db.execute("""
                UPDATE agent_runs SET
                    status = ?,
                    completed_at = ?,
                    roles_discovered = ?,
                    roles_assessed = ?,
                    roles_queued = ?,
                    roles_discarded = ?,
                    errors = ?
                WHERE run_id = ? AND agent_name = ?
            """, (
                status,
                datetime.now().isoformat(),
                self.stats["roles_discovered"],
                self.stats["roles_assessed"],
                self.stats["roles_queued"],
                self.stats["roles_discarded"],
                json.dumps(self.errors) if self.errors else None,
                self.run_id,
                self.agent_name,
            ))
