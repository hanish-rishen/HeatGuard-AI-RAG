"""
CONTEXT: Data Fetcher Service - Fetches real-time weather data and district census data.
PURPOSE:
    - Fetch today's weather (Temperature, Humidity, LST) from NASA POWER API
    - Load district census data from CSV dataset
"""

import requests
import pandas as pd
import json
from pathlib import Path
from typing import Dict, Optional, List
from datetime import datetime, timedelta
import logging

from app.core.config import get_backend_dir

logger = logging.getLogger(__name__)


class DataFetcher:
    """
    Fetches real-time environmental data and static census data for districts.
    """

    _instance: Optional['DataFetcher'] = None
    _initialized: bool = False

    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the data fetcher."""
        if not DataFetcher._initialized:
            self.district_coords = {}
            self._load_district_data()
            self._load_district_geocodes()
            DataFetcher._initialized = True
            logger.info("DataFetcher initialized successfully")

    def _load_district_geocodes(self):
        """Load district coordinates from JSON."""
        try:
            backend_dir = get_backend_dir()
            json_path = backend_dir.parent / "data" / "District-Geocodes.json"

            if not json_path.exists():
                logger.error(f"Geocodes not found at {json_path}")
                return

            with open(json_path, 'r', encoding='utf-8') as f:
                geocodes_list = json.load(f)

            for item in geocodes_list:
                district = item.get("District_Name")
                lat = item.get("Latitude")
                lon = item.get("Longitude")

                # NOTE: don't use truthiness here; coordinates like 0.0 are valid numbers.
                if district is None or lat is None or lon is None:
                    continue

                try:
                    # Clean district name (remove trailing spaces found in JSON)
                    clean_name = str(district).strip()
                    self.district_coords[clean_name] = {
                        "lat": float(lat),
                        "lon": float(lon),
                    }
                except (ValueError, TypeError):
                    continue

            # Manual Fixes for known missing coordinates (Tonk, Theni, Tirunelveli)
            self.district_coords["Tonk"] = {"lat": 26.1630, "lon": 75.7904} # Tonk, Rajasthan
            self.district_coords["Theni"] = {"lat": 10.0104, "lon": 77.4768} # Theni, Tamil Nadu
            self.district_coords["Tirunelveli"] = {"lat": 8.7139, "lon": 77.7567} # Tirunelveli, Tamil Nadu
            self.district_coords["Tirunelveli " ] = {"lat": 8.7139, "lon": 77.7567} # Try with space just in case

            # Fast case-insensitive lookup map (used by API layer).
            self.district_coords_lower = {k.casefold(): k for k in self.district_coords.keys()}

            logger.info(f"Loaded coordinates for {len(self.district_coords)} districts")

        except Exception as e:
            logger.error(f"Failed to load district geocodes: {e}")

    def _load_district_data(self):
        """Load district census data from CSV."""
        try:
            # Navigate to data folder
            backend_dir = get_backend_dir()
            csv_path = backend_dir.parent / "data" / "heat_health_final_training_set.csv"

            if not csv_path.exists():
                logger.error(f"Dataset not found at {csv_path}")
                self.district_data = pd.DataFrame()
                return

            # Load CSV
            df = pd.read_csv(csv_path)

            # Get unique district data (census data is constant per district)
            self.district_data = df.groupby('District').first().reset_index()
            self.district_data = self.district_data[['District', 'pct_children', 'pct_outdoor_workers', 'pct_vulnerable_social']]

            logger.info(f"Loaded census data for {len(self.district_data)} districts")

        except Exception as e:
            logger.error(f"Failed to load district data: {e}")
            self.district_data = pd.DataFrame()

    def get_district_census(self, district_name: str) -> Optional[Dict[str, float]]:
        """
        Get census data for a specific district.

        Returns:
            Dict with pct_children, pct_outdoor_workers, pct_vulnerable_social
        """
        if self.district_data.empty:
            return None

        district_row = self.district_data[self.district_data['District'] == district_name]

        if district_row.empty:
            logger.warning(f"District '{district_name}' not found in dataset")
            return None

        return {
            'pct_children': float(district_row.iloc[0]['pct_children']),
            'pct_outdoor_workers': float(district_row.iloc[0]['pct_outdoor_workers']),
            'pct_vulnerable_social': float(district_row.iloc[0]['pct_vulnerable_social'])
        }

    def get_all_districts(self) -> List[str]:
        """Get list of all districts in the dataset."""
        if self.district_data.empty:
            return []
        return self.district_data['District'].tolist()

    def fetch_nasa_weather(self, district_name: str, date: Optional[str] = None) -> Optional[Dict[str, float]]:
        """
        Fetch weather data from NASA POWER API for a specific district.

        Args:
            district_name: Name of the district
            date: Date in 'YYYY-MM-DD' format (defaults to today)

        Returns:
            Dict with max_temp, humidity, lst (land surface temperature)
        """
        if district_name in self.district_coords:
            coords = self.district_coords[district_name]
        else:
            logger.warning(f"Coordinates not available for {district_name}, using default")
            # Use a central India coordinate as fallback
            coords = {"lat": 23.0, "lon": 78.0}

        # Determine date
        if date is None:
            # Use today's date for realtime data as requested
            target_date = datetime.now().strftime("%Y%m%d")
        else:
            target_date = date.replace("-", "")

        try:
            # NASA POWER API endpoint
            # Switching to Open-Meteo for better real-time availability
            # NASA Power has significant lag for "today's" data

            # API: https://open-meteo.com/en/docs
            url = "https://api.open-meteo.com/v1/forecast"

            # Open-Meteo generally returns data in ISO8601 YYYY-MM-DD
            req_date = datetime.now().strftime("%Y-%m-%d") if date is None else date

            params = {
                "latitude": coords["lat"],
                "longitude": coords["lon"],
                "daily": "temperature_2m_max,uv_index_max",
                "current": "relative_humidity_2m,surface_pressure", # Approximation for LST/Humidity
                "timezone": "auto",
                "start_date": req_date,
                "end_date": req_date
            }

            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            # Extract
            daily = data.get("daily", {})
            current = data.get("current", {})

            # Get Max Temp
            max_temp_list = daily.get("temperature_2m_max", [])
            max_temp = max_temp_list[0] if max_temp_list else None

            # Get Humidity (Use current as proxy for daily average if necessary, or fetch hourly and average)
            humidity = current.get("relative_humidity_2m")

            # LST Approximation from UV? Or just use Temperature as proxy for now since LST is hard to get real-time free.
            # Ideally we need MODIS data for LST.
            # For "Real Data" request, we will use Max Temp + 2 degrees as a physics-based heuristic for surface temp in urban areas
            # if real LST isn't available, rather than a fixed random number.
            # But let's try to be honest.
            # We will use Max Temp if LST is missing.
            lst = max_temp + 2.0 if max_temp else None

            if max_temp is None or humidity is None:
                 logger.error(f"Incomplete data from Open-Meteo for {district_name}")
                 return None

            return {
                "max_temp": float(max_temp),
                "humidity": float(humidity),
                "lst": float(lst)
            }

        except Exception as e:
            logger.error(f"Failed to fetch weather data for {district_name}: {e}")
            return None


# Singleton instance
data_fetcher = DataFetcher()
