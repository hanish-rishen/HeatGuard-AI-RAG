"""
Database Manager - Supports SQLite (local dev) and PostgreSQL (Leapcell production)
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Database type detection
USE_POSTGRES = os.getenv("DATABASE_URL", "").startswith("postgresql")

if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor, execute_values

    logger.info("Using PostgreSQL database")
else:
    import sqlite3
    from pathlib import Path
    from app.core.config import get_backend_dir

    logger.info("Using SQLite database")


class DBManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DBManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def _ensure_initialized(self):
        """Lazy initialize DB on first use."""
        if not self._initialized:
            self.init_db()
            self._initialized = True

    def _get_connection(self):
        """Get database connection based on configuration."""
        if USE_POSTGRES:
            database_url = os.getenv("DATABASE_URL")
            return psycopg2.connect(database_url)
        else:
            # SQLite fallback for local development
            import tempfile
            import os as os_module

            if os_module.name == "nt":  # Windows
                db_path = Path(get_backend_dir()) / "district_analytics.db"
            else:
                tmp_path = Path("/tmp") / "district_analytics.db"
                try:
                    tmp_path.parent.mkdir(parents=True, exist_ok=True)
                    test_file = tmp_path.parent / ".write_test"
                    test_file.touch()
                    test_file.unlink()
                    db_path = tmp_path
                except (OSError, PermissionError):
                    db_path = Path(get_backend_dir()) / "district_analytics.db"

            return sqlite3.connect(db_path)

    def init_db(self):
        """Initialize database schema."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                # PostgreSQL schema
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS daily_analysis (
                        id SERIAL PRIMARY KEY,
                        date DATE NOT NULL,
                        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        district_name VARCHAR(255) NOT NULL,
                        lat REAL,
                        lon REAL,
                        risk_score REAL,
                        risk_status VARCHAR(50),
                        heat_index REAL,
                        max_temp REAL,
                        humidity REAL,
                        lst REAL,
                        pct_children REAL,
                        pct_outdoor_workers REAL,
                        pct_vulnerable_social REAL,
                        UNIQUE(date, district_name)
                    )
                """)

                # Create index for faster queries
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_daily_analysis_date 
                    ON daily_analysis(date)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_daily_analysis_computed 
                    ON daily_analysis(computed_at)
                """)
            else:
                # SQLite schema
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS daily_analysis (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        date TEXT NOT NULL,
                        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        district_name TEXT NOT NULL,
                        lat REAL,
                        lon REAL,
                        risk_score REAL,
                        risk_status TEXT,
                        heat_index REAL,
                        max_temp REAL,
                        humidity REAL,
                        lst REAL,
                        pct_children REAL,
                        pct_outdoor_workers REAL,
                        pct_vulnerable_social REAL,
                        UNIQUE(date, district_name)
                    )
                """)

            conn.commit()
            conn.close()
            logger.info("Database initialized successfully")

        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise

    def get_connection(self):
        """Get a database connection."""
        self._ensure_initialized()
        return self._get_connection()

    def save_result(self, data: Dict):
        """Save a single district analysis result."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            today = datetime.now().strftime("%Y-%m-%d")

            if USE_POSTGRES:
                cursor.execute(
                    """
                    INSERT INTO daily_analysis (
                        date, computed_at, district_name, lat, lon, risk_score, risk_status, heat_index,
                        max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                    ) VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (date, district_name) DO UPDATE SET
                        computed_at = NOW(),
                        lat = EXCLUDED.lat,
                        lon = EXCLUDED.lon,
                        risk_score = EXCLUDED.risk_score,
                        risk_status = EXCLUDED.risk_status,
                        heat_index = EXCLUDED.heat_index,
                        max_temp = EXCLUDED.max_temp,
                        humidity = EXCLUDED.humidity,
                        lst = EXCLUDED.lst,
                        pct_children = EXCLUDED.pct_children,
                        pct_outdoor_workers = EXCLUDED.pct_outdoor_workers,
                        pct_vulnerable_social = EXCLUDED.pct_vulnerable_social
                """,
                    (
                        today,
                        data["district_name"],
                        data.get("lat"),
                        data.get("lon"),
                        data["risk_score"],
                        data["risk_status"],
                        data["heat_index"],
                        data["max_temp"],
                        data["humidity"],
                        data["lst"],
                        data["pct_children"],
                        data["pct_outdoor_workers"],
                        data["pct_vulnerable_social"],
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO daily_analysis (
                        date, computed_at, district_name, lat, lon, risk_score, risk_status, heat_index,
                        max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                    ) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        today,
                        data["district_name"],
                        data.get("lat"),
                        data.get("lon"),
                        data["risk_score"],
                        data["risk_status"],
                        data["heat_index"],
                        data["max_temp"],
                        data["humidity"],
                        data["lst"],
                        data["pct_children"],
                        data["pct_outdoor_workers"],
                        data["pct_vulnerable_social"],
                    ),
                )

            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving result for {data.get('district_name')}: {e}")

    def save_results_bulk(self, results: List[Dict]) -> int:
        """Save multiple district results efficiently using bulk insert."""
        self._ensure_initialized()
        if not results:
            return 0

        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            today = datetime.now().strftime("%Y-%m-%d")
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Prepare records
            records = [
                (
                    today,
                    now_str,
                    r["district_name"],
                    r.get("lat"),
                    r.get("lon"),
                    r["risk_score"],
                    r["risk_status"],
                    r["heat_index"],
                    r["max_temp"],
                    r["humidity"],
                    r["lst"],
                    r["pct_children"],
                    r["pct_outdoor_workers"],
                    r["pct_vulnerable_social"],
                )
                for r in results
            ]

            if USE_POSTGRES:
                # Use PostgreSQL's execute_values for bulk insert
                execute_values(
                    cursor,
                    """
                    INSERT INTO daily_analysis (
                        date, computed_at, district_name, lat, lon, risk_score, risk_status, heat_index,
                        max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                    ) VALUES %s
                    ON CONFLICT (date, district_name) DO UPDATE SET
                        computed_at = EXCLUDED.computed_at,
                        lat = EXCLUDED.lat,
                        lon = EXCLUDED.lon,
                        risk_score = EXCLUDED.risk_score,
                        risk_status = EXCLUDED.risk_status,
                        heat_index = EXCLUDED.heat_index,
                        max_temp = EXCLUDED.max_temp,
                        humidity = EXCLUDED.humidity,
                        lst = EXCLUDED.lst,
                        pct_children = EXCLUDED.pct_children,
                        pct_outdoor_workers = EXCLUDED.pct_outdoor_workers,
                        pct_vulnerable_social = EXCLUDED.pct_vulnerable_social
                    """,
                    records,
                    page_size=100,
                )
            else:
                # SQLite bulk insert
                cursor.executemany(
                    """
                    INSERT OR REPLACE INTO daily_analysis (
                        date, computed_at, district_name, lat, lon, risk_score, risk_status, heat_index,
                        max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    records,
                )

            conn.commit()
            conn.close()

            logger.info(f"Bulk saved {len(records)} district results")
            return len(records)

        except Exception as e:
            logger.error(f"Error in bulk save: {e}")
            return 0

    def get_results_for_date(self, date_str: str) -> List[Dict]:
        """Fetch all results for a specific date."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()

            if USE_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(
                    "SELECT * FROM daily_analysis WHERE date = %s", (date_str,)
                )
                rows = cursor.fetchall()
                conn.close()
                return [dict(row) for row in rows]
            else:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM daily_analysis WHERE date = ?", (date_str,)
                )
                rows = cursor.fetchall()
                conn.close()
                return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Error fetching results: {e}")
            return []

    def get_result_for_district(
        self, district_name: str, date_str: str
    ) -> Optional[Dict]:
        """Fetch result for a specific district and date."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()

            if USE_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(
                    "SELECT * FROM daily_analysis WHERE district_name = %s AND date = %s",
                    (district_name, date_str),
                )
            else:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM daily_analysis WHERE district_name = ? AND date = ?",
                    (district_name, date_str),
                )

            row = cursor.fetchone()
            conn.close()

            return dict(row) if row else None

        except Exception as e:
            logger.error(f"Error fetching district result: {e}")
            return None

    def get_district_history(self, district_name: str, days: int = 60) -> List[Dict]:
        """Fetch historical data for a district."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()

            if USE_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(
                    """
                    SELECT * FROM daily_analysis 
                    WHERE district_name = %s 
                    ORDER BY date DESC 
                    LIMIT %s
                """,
                    (district_name, days),
                )
            else:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT * FROM daily_analysis 
                    WHERE district_name = ? 
                    ORDER BY date DESC 
                    LIMIT ?
                """,
                    (district_name, days),
                )

            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Error fetching district history: {e}")
            return []

    def has_fresh_data(self, max_age_minutes: int = 30) -> bool:
        """Check if we have data computed within the last N minutes."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM daily_analysis
                    WHERE computed_at >= NOW() - INTERVAL '%s minutes'
                """,
                    (max_age_minutes,),
                )
            else:
                cursor.execute(f"""
                    SELECT COUNT(*) FROM daily_analysis
                    WHERE computed_at >= datetime('now', '-{max_age_minutes} minutes')
                """)

            count = cursor.fetchone()[0]
            conn.close()

            logger.info(
                f"Fresh data check: {count} records computed within last {max_age_minutes} minutes"
            )
            return count > 0

        except Exception as e:
            logger.error(f"Error checking fresh data: {e}")
            return False


# Global instance
db_manager = DBManager()
