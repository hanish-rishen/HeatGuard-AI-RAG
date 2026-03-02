import sqlite3
from datetime import datetime
import json
from pathlib import Path
from typing import List, Dict, Optional
from app.core.config import get_backend_dir
import logging

logger = logging.getLogger(__name__)


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

    def init_db(self):
        # Use backend directory for database (cross-platform compatible)
        import tempfile
        import os

        # Try different locations in order of preference
        if os.name == "nt":  # Windows
            # On Windows, use the backend directory
            self.db_path = get_backend_dir() / "district_analytics.db"
        else:
            # On Linux/Mac, try /tmp first, then fallback to backend dir
            tmp_path = Path("/tmp") / "district_analytics.db"
            try:
                # Test if /tmp is writable
                tmp_path.parent.mkdir(parents=True, exist_ok=True)
                test_file = tmp_path.parent / ".write_test"
                test_file.touch()
                test_file.unlink()
                self.db_path = tmp_path
            except (OSError, PermissionError):
                # Fallback to backend directory
                self.db_path = get_backend_dir() / "district_analytics.db"

        logger.info(f"Using database at: {self.db_path}")

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Create table for daily analysis results
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
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

            # Migration: ensure lat/lon columns exist for older DBs
            try:
                cursor.execute("ALTER TABLE daily_analysis ADD COLUMN lat REAL")
            except sqlite3.OperationalError:
                pass
            try:
                cursor.execute("ALTER TABLE daily_analysis ADD COLUMN lon REAL")
            except sqlite3.OperationalError:
                pass

            # Create table for uploaded files metadata
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS uploaded_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    upload_date TEXT NOT NULL,
                    size_bytes INTEGER,
                    content_type TEXT,
                    description TEXT,
                    status TEXT DEFAULT 'Processing',
                    UNIQUE(filename)
                )
            """)

            # Migration: Ensure status column exists (for existing dbs)
            try:
                cursor.execute(
                    "ALTER TABLE uploaded_files ADD COLUMN status TEXT DEFAULT 'Indexed'"
                )
            except sqlite3.OperationalError:
                pass  # Column exists

            conn.commit()
            conn.close()
            logger.info(f"Database initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")

    def get_connection(self):
        self._ensure_initialized()
        return sqlite3.connect(self.db_path)

    def get_results_for_date(self, date_str: str) -> List[Dict]:
        """Fetch all results for a specific date."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM daily_analysis WHERE date = ?", (date_str,))
            rows = cursor.fetchall()
            conn.close()

            results = []
            for row in rows:
                results.append(dict(row))
            return results
        except Exception as e:
            logger.error(f"Error fetching results: {e}")
            return []

    def get_all_files(self) -> List[Dict]:
        """Fetch all uploaded files metadata."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM uploaded_files ORDER BY upload_date DESC")
            rows = cursor.fetchall()
            conn.close()

            results = []
            for row in rows:
                results.append(dict(row))
            return results
        except Exception as e:
            logger.error(f"Error fetching files: {e}")
            return []

    def save_file_metadata(self, data: Dict):
        """Save metadata for an uploaded file."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT OR REPLACE INTO uploaded_files (
                    filename, upload_date, size_bytes, content_type, description, status
                ) VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    data["filename"],
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    data.get("size_bytes", 0),
                    data.get("content_type", "unknown"),
                    data.get("description", ""),
                    data.get("status", "Processing"),
                ),
            )

            conn.commit()
            conn.close()
            logger.info(f"Saved metadata for file {data['filename']}")
        except Exception as e:
            logger.error(f"Failed to save file metadata: {e}")
            raise e

    def save_result(self, data: Dict):
        """Save a single district analysis result."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT OR REPLACE INTO daily_analysis (
                    date, district_name, lat, lon, risk_score, risk_status, heat_index,
                    max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    datetime.now().strftime("%Y-%m-%d"),
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
            # logger.info(f"Saved result for {data['district_name']}")
        except Exception as e:
            logger.error(f"Error saving result for {data.get('district_name')}: {e}")

    def save_results_bulk(self, results: List[Dict]) -> int:
        """Bulk insert multiple district results in a single transaction.

        This is ~65x faster than individual inserts for 640 districts:
        - Individual: 640 commits × 15ms = ~9.6s
        - Bulk: 1 commit = ~0.15s

        Args:
            results: List of district result dictionaries

        Returns:
            Number of records inserted
        """
        if not results:
            return 0

        self._ensure_initialized()

        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            today = datetime.now().strftime("%Y-%m-%d")

            # Prepare records for bulk insert
            records = [
                (
                    today,
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

            # Execute bulk insert
            cursor.executemany(
                """
                INSERT OR REPLACE INTO daily_analysis (
                    date, district_name, lat, lon, risk_score, risk_status, heat_index,
                    max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def get_district_history(self, district_name: str, limit: int = 30) -> List[Dict]:
        """Fetch historical data for a district.

        Returns recent rows ordered by date so the UI can show a multi-day trend.
        Note: we intentionally avoid `GROUP BY date` here because in SQLite it's non-deterministic
        without aggregates and can collapse history unexpectedly.
        """
        self._ensure_initialized()
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute(
                """
        SELECT date, risk_score, heat_index, max_temp, humidity, lst
        FROM daily_analysis
        WHERE district_name = ?
        ORDER BY date DESC, id DESC
        LIMIT ?
            """,
                (district_name, limit),
            )

            rows = cursor.fetchall()
            conn.close()

            # Return reversed to show timeline correctly (oldest to newest)
            return [dict(row) for row in rows][::-1]

        except Exception as e:
            logger.error(f"Error fetching history for {district_name}: {e}")
            return []

    def update_file_status(self, filename: str, status: str):
        """Update the processing status of a file."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE uploaded_files SET status = ? WHERE filename = ?",
                (status, filename),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to update status for {filename}: {e}")

    def delete_file_metadata(self, filename: str) -> bool:
        """Delete metadata for a file."""
        self._ensure_initialized()
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM uploaded_files WHERE filename = ?", (filename,))
            rows = cursor.rowcount
            conn.commit()
            conn.close()
            return rows > 0
        except Exception as e:
            logger.error(f"Failed to delete metadata for {filename}: {e}")
            return False


db_manager = DBManager()
