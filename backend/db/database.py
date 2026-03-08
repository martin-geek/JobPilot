"""
JobPilot Database Module
Handles SQLite connection, initialization, and session management.
Uses aiosqlite for async operations with FastAPI.
"""

import os
import sqlite3
import aiosqlite
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# Database file location
DB_DIR = Path(__file__).parent.parent.parent / "data"
DB_PATH = DB_DIR / "jobpilot.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_sync_connection() -> sqlite3.Connection:
    """Get a synchronous database connection (for scripts and migrations)."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


async def get_connection() -> aiosqlite.Connection:
    """Get an async database connection."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = await aiosqlite.connect(str(DB_PATH))
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    return conn


@asynccontextmanager
async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """Async context manager for database sessions.

    Usage:
        async with get_db() as db:
            await db.execute("SELECT * FROM jobs")
    """
    conn = await get_connection()
    try:
        yield conn
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    finally:
        await conn.close()


def init_database() -> None:
    """Initialize the database with the schema.
    Safe to run multiple times — uses IF NOT EXISTS.
    """
    conn = get_sync_connection()
    try:
        with open(SCHEMA_PATH, "r") as f:
            schema_sql = f.read()
        conn.executescript(schema_sql)
        conn.commit()
        print(f"✓ Database initialized at {DB_PATH}")
        print(f"  Tables: {_get_table_count(conn)}")
    finally:
        conn.close()


def _get_table_count(conn: sqlite3.Connection) -> int:
    """Count tables in the database."""
    cursor = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    return cursor.fetchone()[0]


# CLI entry point
if __name__ == "__main__":
    init_database()
