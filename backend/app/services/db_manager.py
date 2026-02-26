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
            cls._instance.init_db()
        return cls._instance

    def init_db(self):
        self.db_path = get_backend_dir().parent / "district_analytics.db"
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Create table for daily analysis results
            cursor.execute('''
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
            ''')

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
            cursor.execute('''
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
            ''')

            # Migration: Ensure status column exists (for existing dbs)
            try:
                cursor.execute("ALTER TABLE uploaded_files ADD COLUMN status TEXT DEFAULT 'Indexed'")
            except sqlite3.OperationalError:
                pass # Column exists

            conn.commit()
            conn.close()
            logger.info(f"Database initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")

    def get_connection(self):
        return sqlite3.connect(self.db_path)

    def get_results_for_date(self, date_str: str) -> List[Dict]:
        """Fetch all results for a specific date."""
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
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute('''
                INSERT OR REPLACE INTO uploaded_files (
                    filename, upload_date, size_bytes, content_type, description, status
                ) VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                data['filename'],
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                data.get('size_bytes', 0),
                data.get('content_type', 'unknown'),
                data.get('description', ''),
                data.get('status', 'Processing')
            ))

            conn.commit()
            conn.close()
            logger.info(f"Saved metadata for file {data['filename']}")
        except Exception as e:
            logger.error(f"Failed to save file metadata: {e}")
            raise e

    def save_result(self, data: Dict):
        """Save a single district analysis result."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute('''
                INSERT OR REPLACE INTO daily_analysis (
                    date, district_name, lat, lon, risk_score, risk_status, heat_index,
                    max_temp, humidity, lst, pct_children, pct_outdoor_workers, pct_vulnerable_social
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                datetime.now().strftime("%Y-%m-%d"),
                data['district_name'],
                data.get('lat'),
                data.get('lon'),
                data['risk_score'],
                data['risk_status'],
                data['heat_index'],
                data['max_temp'],
                data['humidity'],
                data['lst'],
                data['pct_children'],
                data['pct_outdoor_workers'],
                data['pct_vulnerable_social']
            ))

            conn.commit()
            conn.close()
            # logger.info(f"Saved result for {data['district_name']}")
        except Exception as e:
            logger.error(f"Error saving result for {data.get('district_name')}: {e}")

    def get_district_history(self, district_name: str, limit: int = 30) -> List[Dict]:
        """Fetch historical data for a district.

    Returns recent rows ordered by date so the UI can show a multi-day trend.
    Note: we intentionally avoid `GROUP BY date` here because in SQLite it's non-deterministic
    without aggregates and can collapse history unexpectedly.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute('''
        SELECT date, risk_score, heat_index, max_temp, humidity, lst
        FROM daily_analysis
        WHERE district_name = ?
        ORDER BY date DESC, id DESC
        LIMIT ?
            ''', (district_name, limit))

            rows = cursor.fetchall()
            conn.close()

            # Return reversed to show timeline correctly (oldest to newest)
            return [dict(row) for row in rows][::-1]

        except Exception as e:
            logger.error(f"Error fetching history for {district_name}: {e}")
            return []

    def update_file_status(self, filename: str, status: str):
        """Update the processing status of a file."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE uploaded_files SET status = ? WHERE filename = ?", (status, filename))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to update status for {filename}: {e}")

    def delete_file_metadata(self, filename: str) -> bool:
        """Delete metadata for a file."""
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
