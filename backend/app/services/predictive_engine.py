"""
CONTEXT: Predictive Engine - XGBoost model for hospitalization risk prediction.
NEIGHBORHOOD:
    - Imported by: app/api/routes.py
    - Imports from: app/core/config.py
    - Uses models: ../Models/heat_health_model_v1.pkl, district_encoder.pkl

PURPOSE: Loads the trained XGBoost model and predicts hospitalization load based on
environmental and demographic data. Implements the Rothfusz Regression for Heat Index.
"""

from pathlib import Path
from typing import Tuple, Optional, List, Dict
from datetime import datetime

from app.core.config import get_settings, get_backend_dir

# Lazy imports for heavy libraries
joblib = None
np = None
pd = None


def _get_joblib():
    global joblib
    if joblib is None:
        import joblib as _joblib

        joblib = _joblib
    return joblib


def _get_numpy():
    global np
    if np is None:
        import numpy as _np

        np = _np
    return np


def _get_pandas():
    global pd
    if pd is None:
        import pandas as _pd

        pd = _pd
    return pd


class PredictiveEngine:
    """
    PURPOSE: XGBoost-based prediction engine for heat-health impact assessment.

    RELATIONSHIPS:
        - Loads pre-trained models from ../Models/
        - Uses Rothfusz Regression for Heat Index calculation

    CONSUMERS: analyze_district() in routes.py

    The model predicts hospitalization load based on:
    - Exposure: Max_Temp, LST, Humidity, Heat_Index
    - Sensitivity: pct_children, pct_outdoor_workers
    - Adaptive Capacity: pct_vulnerable_social
    - Temporal: Month, DayOfYear
    - Geographic: District_Encoded
    """

    _instance: Optional["PredictiveEngine"] = None
    _initialized: bool = False

    def __new__(cls):
        """Singleton pattern to ensure model is loaded only once."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the predictive engine with lazy loading."""
        if PredictiveEngine._initialized:
            return

        self.model = None
        self.encoder = None
        self.settings = get_settings()
        self._models_loaded = False
        PredictiveEngine._initialized = True

    def _ensure_loaded(self):
        """Lazy load models on first use."""
        if not self._models_loaded:
            self._load_models()
            self._models_loaded = True

    def _load_models(self) -> None:
        """
        PURPOSE: Load the XGBoost model and district encoder from disk.

        Logic Flow:
        1. Resolve absolute paths from config
        2. Load the pickled XGBoost model
        3. Load the LabelEncoder for district names

        WHY: Models are loaded at startup to avoid I/O during predictions.
        """
        backend_dir = get_backend_dir()

        # Step 1: Resolve model paths
        model_path = backend_dir / self.settings.model_path
        encoder_path = backend_dir / self.settings.encoder_path

        # Step 2: Load XGBoost model
        try:
            self.model = _get_joblib().load(model_path)
            print(f"[PredictiveEngine] Loaded model from {model_path}")
        except Exception as e:
            print(f"[PredictiveEngine] ERROR loading model: {e}")
            # Don't hard-crash the API on startup if artifacts aren't present.
            # The /health endpoint will report model_loaded=false and /analyze
            # can return a clear error.
            self.model = None
            self.encoder = None
            return

        # Step 3: Load district encoder
        try:
            self.encoder = _get_joblib().load(encoder_path)
            print(f"[PredictiveEngine] Loaded encoder from {encoder_path}")
            print(
                f"[PredictiveEngine] Encoder supports {len(self.encoder.classes_)} districts"
            )
        except Exception as e:
            print(f"[PredictiveEngine] ERROR loading encoder: {e}")
            self.model = None
            self.encoder = None
            return

    def calculate_heat_index(self, temperature_c: float, humidity: float) -> float:
        """
        PURPOSE: Calculate Heat Index using Rothfusz Regression.

        RELATIONSHIPS: Used in predict() method before model inference.

        WHY: Heat Index captures the non-linear interaction between temperature
        and humidity that affects human thermoregulation. A 42┬░C day with high
        humidity is far more dangerous than the same temperature with low humidity.

        Formula: HI = cΓéü + cΓééT + cΓéâR + cΓéäTR + cΓéàT┬▓ + cΓéåR┬▓ + cΓéçT┬▓R + cΓéêTR┬▓ + cΓéëT┬▓R┬▓

        Args:
            temperature_c: Air temperature in Celsius
            humidity: Relative humidity (0-100%)

        Returns:
            Heat Index in Celsius
        """
        # Step 1: Convert Celsius to Fahrenheit (Rothfusz uses Fahrenheit)
        T = (temperature_c * 9 / 5) + 32
        RH = humidity

        # Step 2: Rothfusz Regression coefficients
        c1 = -42.379
        c2 = 2.04901523
        c3 = 10.14333127
        c4 = -0.22475541
        c5 = -6.83783e-3
        c6 = -5.481717e-2
        c7 = 1.22874e-3
        c8 = 8.5282e-4
        c9 = -1.99e-6

        # Step 3: Calculate Heat Index in Fahrenheit
        HI_F = (
            c1
            + (c2 * T)
            + (c3 * RH)
            + (c4 * T * RH)
            + (c5 * T**2)
            + (c6 * RH**2)
            + (c7 * T**2 * RH)
            + (c8 * T * RH**2)
            + (c9 * T**2 * RH**2)
        )

        # Step 4: Convert back to Celsius
        HI_C = (HI_F - 32) * 5 / 9

        return round(HI_C, 2)

    def encode_district(self, district_name: str) -> int:
        """
        PURPOSE: Encode district name to integer using pre-trained LabelEncoder.

        WHY: XGBoost requires numeric features. The encoder maps 640 district
        names to unique integers.

        Args:
            district_name: Name of the district (e.g., "Adilabad")

        Returns:
            Encoded integer, or 0 if district not found
        """
        self._ensure_loaded()
        try:
            return self.encoder.transform([district_name])[0]
        except ValueError:
            # District not in encoder - return default
            print(
                f"[PredictiveEngine] WARNING: District '{district_name}' not found, using default encoding"
            )
            return 0

    def predict(
        self,
        district_name: str,
        max_temp: float,
        lst: float,
        humidity: float,
        pct_children: float,
        pct_outdoor_workers: float,
        pct_vulnerable_social: float,
        date_str: str,
    ) -> Tuple[float, float]:
        """
        PURPOSE: Predict hospitalization load for a district.

        RELATIONSHIPS:
            - Calls calculate_heat_index() for feature engineering
            - Calls encode_district() for geographic encoding

        CONSUMERS: /analyze endpoint

        Logic Flow:
        1. Parse date to extract temporal features (Month, DayOfYear)
        2. Calculate Heat Index from temperature and humidity
        3. Encode district name
        4. Prepare feature array matching training order
        5. Run XGBoost prediction
        6. Ensure non-negative output

        Args:
            district_name: Name of the district
            max_temp: Maximum air temperature (┬░C)
            lst: Land Surface Temperature (┬░C)
            humidity: Relative humidity (%)
            pct_children: Percentage of children
            pct_outdoor_workers: Percentage of outdoor workers
            pct_vulnerable_social: Percentage of vulnerable social groups
            date_str: Date in YYYY-MM-DD format

        Returns:
            Tuple of (predicted_hospitalization_load, heat_index)
        """
        self._ensure_loaded()
        if not self.is_loaded():
            raise RuntimeError(
                "Predictive model artifacts are not loaded. "
                "Ensure Models/heat_health_model_v1.pkl and Models/district_encoder.pkl exist."
            )
        # Step 1: Parse date for temporal features
        date_dt = datetime.strptime(date_str, "%Y-%m-%d")
        month = date_dt.month
        day_of_year = date_dt.timetuple().tm_yday

        # Step 2: Calculate Heat Index
        heat_index = self.calculate_heat_index(max_temp, humidity)

        # Step 3: Encode district
        district_encoded = self.encode_district(district_name)

        # Step 4: Prepare feature array (MUST match training order!)
        # Training order: Max_Temp, LST, Humidity, Heat_Index,
        #                 pct_children, pct_outdoor_workers, pct_vulnerable_social,
        #                 Month, DayOfYear, District_Encoded
        numpy = _get_numpy()
        features = numpy.array(
            [
                [
                    max_temp,
                    lst,
                    humidity,
                    heat_index,
                    pct_children,
                    pct_outdoor_workers,
                    pct_vulnerable_social,
                    month,
                    day_of_year,
                    district_encoded,
                ]
            ]
        )

        # Step 5: Run prediction
        prediction = self.model.predict(features)[0]

        # Step 6: Ensure non-negative output
        prediction = max(0, prediction)

        return round(prediction, 4), heat_index

    def is_loaded(self) -> bool:
        """Check if models are successfully loaded."""
        self._ensure_loaded()
        return self.model is not None and self.encoder is not None

    def get_supported_districts(self) -> list:
        """Return list of all 640 supported district names."""
        self._ensure_loaded()
        if self.encoder is not None:
            return list(self.encoder.classes_)
        return []

    async def predict_batch(
        self, districts_data: List[Dict], max_concurrent: int = 30
    ) -> List[Tuple[float, float]]:
        """Run predictions for multiple districts in parallel.

        This is CPU-bound (XGBoost), so we use ThreadPoolExecutor
        to parallelize across multiple cores.

        Args:
            districts_data: List of dicts with district data
            max_concurrent: Maximum concurrent predictions (default: 30)

        Returns:
            List of (prediction, heat_index) tuples
        """
        from concurrent.futures import ThreadPoolExecutor
        import asyncio

        self._ensure_loaded()
        if not self.is_loaded():
            raise RuntimeError("Predictive model not loaded")

        def predict_single(data: Dict) -> Tuple[float, float]:
            """Wrapper for single prediction."""
            try:
                return self.predict(
                    district_name=data["district_name"],
                    max_temp=data["max_temp"],
                    lst=data["lst"],
                    humidity=data["humidity"],
                    pct_children=data["pct_children"],
                    pct_outdoor_workers=data["pct_outdoor_workers"],
                    pct_vulnerable_social=data["pct_vulnerable_social"],
                    date_str=data["date"],
                )
            except Exception as e:
                logger.error(f"Prediction failed for {data.get('district_name')}: {e}")
                return (0.0, 0.0)

        # Use semaphore to limit concurrency
        semaphore = asyncio.Semaphore(max_concurrent)

        async def predict_with_limit(data: Dict) -> Tuple[float, float]:
            async with semaphore:
                loop = asyncio.get_event_loop()
                # Run CPU-bound prediction in thread pool
                return await loop.run_in_executor(None, predict_single, data)

        # Run all predictions in parallel
        results = await asyncio.gather(*[predict_with_limit(d) for d in districts_data])
        return results


# Global instance for dependency injection
predictive_engine = PredictiveEngine()
