"""
Database Manager - Supports SQLite (local dev) and PostgreSQL (Leapcell production)
"""

import os
import json
import logging
import time  # MODIFIED: Added for connection retry delay
from datetime import datetime
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
from pathlib import Path

# MODIFIED: Import get_settings at the top
from app.core.config import get_settings, DEFAULT_SQLITE_DB

logger = logging.getLogger(__name__)

# Load .env file explicitly before checking DATABASE_URL
# This ensures local development can use PostgreSQL via .env
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path, override=True)
        logger.info(f"Loaded environment from {env_path}")
    except ImportError:
        pass  # python-dotenv not installed


# MODIFIED: Changed USE_POSTGRES detection logic to check use_local_mode first
def _detect_database_type():
    """Detect which database to use based on settings and environment."""
    try:
        settings = get_settings()
        # MODIFIED: First check if use_local_mode is True in settings
        if settings.use_local_mode:
            logger.info(
                "[MODE DETECTION] use_local_mode=True → Using SQLITE (Local Mode)"
            )
            return False  # Force SQLite
        else:
            logger.info(
                "[MODE DETECTION] use_local_mode=False → Will check DATABASE_URL"
            )
    except Exception as e:
        logger.warning(
            f"[MODE DETECTION] Could not load settings, falling back to env check: {e}"
        )

    database_url = settings.get_effective_database_url() or ""
    has_postgres_url = database_url.startswith("postgresql")

    if has_postgres_url:
        logger.info(
            f"[MODE DETECTION] DATABASE_URL starts with 'postgresql' → Using POSTGRESQL (Deployed Mode)"
        )
        logger.info(
            f"[MODE DETECTION] Database host: {database_url.split('@')[1].split('/')[0] if '@' in database_url else 'unknown'}"
        )
    else:
        logger.info(
            f"[MODE DETECTION] DATABASE_URL not set or not PostgreSQL → Using SQLITE (Fallback)"
        )

    return has_postgres_url


USE_POSTGRES = _detect_database_type()

# Log database mode clearly
logger.info("=" * 60)
logger.info(
    "DATABASE MODE: %s",
    "POSTGRESQL (Remote/Deployed)" if USE_POSTGRES else "SQLITE (Local File)",
)
logger.info("=" * 60)

if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor, execute_values

    logger.info("PostgreSQL mode enabled - will connect to remote database")
else:
    import sqlite3
    from app.core.config import get_backend_dir

    logger.info("SQLite mode enabled - using local file database")


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
        """Get database connection based on configuration with retry logic."""
        # MODIFIED: Added connection retry logic with up to 3 attempts
        max_retries = 3
        retry_delay = 1  # seconds
        last_error = None

        for attempt in range(1, max_retries + 1):
            try:
                if USE_POSTGRES:
                    settings = get_settings()
                    database_url = settings.get_effective_database_url()
                    return psycopg2.connect(database_url)
                else:
                    # SQLite fallback for local mode
                    settings = get_settings()
                    sqlite_url = settings.get_effective_database_url()
                    db_path = self._resolve_sqlite_path(sqlite_url)
                    return sqlite3.connect(db_path)
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    # MODIFIED: Log each retry attempt
                    logger.warning(
                        f"Database connection attempt {attempt}/{max_retries} failed: {e}. Retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                else:
                    # MODIFIED: All retries exhausted, log final failure
                    logger.error(
                        f"Database connection failed after {max_retries} attempts"
                    )

        # MODIFIED: Only throw error after all retries exhausted
        raise last_error

    def _resolve_sqlite_path(self, sqlite_url: str) -> Path:
        """Resolve sqlite:/// URL into a local filesystem path."""
        if not sqlite_url:
            return Path(get_backend_dir()) / DEFAULT_SQLITE_DB
        if sqlite_url.startswith("sqlite:///./"):
            return Path(get_backend_dir()) / sqlite_url.replace("sqlite:///./", "", 1)
        if sqlite_url.startswith("sqlite:///"):
            return Path(sqlite_url.replace("sqlite:///", "", 1))
        return Path(get_backend_dir()) / DEFAULT_SQLITE_DB

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

                # Create files table for RAG document management
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS files (
                        id SERIAL PRIMARY KEY,
                        filename VARCHAR(500) NOT NULL UNIQUE,
                        size_bytes INTEGER,
                        content_type VARCHAR(100),
                        description TEXT,
                        status VARCHAR(50) DEFAULT 'Processing',
                        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
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

                # Create files table for RAG document management (SQLite)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT NOT NULL UNIQUE,
                        size_bytes INTEGER,
                        content_type TEXT,
                        description TEXT,
                        status TEXT DEFAULT 'Processing',
                        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    def _convert_dates_to_strings(self, rows: List[Dict]) -> List[Dict]:
        """Helper to convert all date objects to strings in query results."""
        if not rows:
            return rows

        result = []
        for row in rows:
            converted = {}
            for key, value in row.items():
                if hasattr(value, "strftime"):  # datetime.date or datetime.datetime
                    converted[key] = value.strftime("%Y-%m-%d")
                else:
                    converted[key] = value
            result.append(converted)
        return result

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
                return self._convert_dates_to_strings([dict(row) for row in rows])
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

            if row:
                converted = self._convert_dates_to_strings([dict(row)])
                return converted[0] if converted else None
            return None

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
            return self._convert_dates_to_strings([dict(row) for row in rows])

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

    # ----------------------------
    # File Management Methods (for RAG)
    # ----------------------------

    def save_file_metadata(self, file_data: Dict) -> bool:
        """Save metadata for an uploaded file."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                cursor.execute(
                    """
                    INSERT INTO files (filename, size_bytes, content_type, description, status)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (filename) DO UPDATE SET
                        size_bytes = EXCLUDED.size_bytes,
                        content_type = EXCLUDED.content_type,
                        description = EXCLUDED.description,
                        status = EXCLUDED.status,
                        uploaded_at = CURRENT_TIMESTAMP
                """,
                    (
                        file_data.get("filename"),
                        file_data.get("size_bytes"),
                        file_data.get("content_type"),
                        file_data.get("description"),
                        file_data.get("status", "Processing"),
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO files (filename, size_bytes, content_type, description, status)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(filename) DO UPDATE SET
                        size_bytes = excluded.size_bytes,
                        content_type = excluded.content_type,
                        description = excluded.description,
                        status = excluded.status,
                        uploaded_at = CURRENT_TIMESTAMP
                """,
                    (
                        file_data.get("filename"),
                        file_data.get("size_bytes"),
                        file_data.get("content_type"),
                        file_data.get("description"),
                        file_data.get("status", "Processing"),
                    ),
                )

            conn.commit()
            conn.close()
            logger.info(f"Saved file metadata: {file_data.get('filename')}")
            return True

        except Exception as e:
            logger.error(f"Error saving file metadata: {e}")
            return False

    def get_all_files(self) -> List[Dict]:
        """Get all uploaded files with their metadata."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                cursor.execute("""
                    SELECT filename, size_bytes, content_type, description, status, uploaded_at
                    FROM files
                    ORDER BY uploaded_at DESC
                """)
            else:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT filename, size_bytes, content_type, description, status, uploaded_at
                    FROM files
                    ORDER BY uploaded_at DESC
                """)

            rows = cursor.fetchall()
            conn.close()

            files = []
            for row in rows:
                if USE_POSTGRES:
                    files.append(
                        {
                            "filename": row[0],
                            "size_bytes": row[1],
                            "content_type": row[2],
                            "description": row[3],
                            "status": row[4],
                            "uploaded_at": row[5].isoformat()
                            if hasattr(row[5], "isoformat")
                            else row[5],
                        }
                    )
                else:
                    files.append(
                        {
                            "filename": row["filename"],
                            "size_bytes": row["size_bytes"],
                            "content_type": row["content_type"],
                            "description": row["description"],
                            "status": row["status"],
                            "uploaded_at": row["uploaded_at"],
                        }
                    )

            return files

        except Exception as e:
            logger.error(f"Error fetching files: {e}")
            return []

    def delete_file_metadata(self, filename: str) -> bool:
        """Delete file metadata from the database."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                cursor.execute("DELETE FROM files WHERE filename = %s", (filename,))
            else:
                cursor.execute("DELETE FROM files WHERE filename = ?", (filename,))

            deleted = cursor.rowcount > 0
            conn.commit()
            conn.close()

            if deleted:
                logger.info(f"Deleted file metadata: {filename}")
            else:
                logger.warning(f"File not found for deletion: {filename}")

            return deleted

        except Exception as e:
            logger.error(f"Error deleting file metadata: {e}")
            return False

    def update_file_status(self, filename: str, status: str) -> bool:
        """Update the processing status of a file."""
        self._ensure_initialized()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if USE_POSTGRES:
                cursor.execute(
                    "UPDATE files SET status = %s WHERE filename = %s",
                    (status, filename),
                )
            else:
                cursor.execute(
                    "UPDATE files SET status = ? WHERE filename = ?", (status, filename)
                )

            updated = cursor.rowcount > 0
            conn.commit()
            conn.close()

            if updated:
                logger.info(f"Updated file status: {filename} -> {status}")

            return updated

        except Exception as e:
            logger.error(f"Error updating file status: {e}")
            return False


# Global instance
db_manager = DBManager()
