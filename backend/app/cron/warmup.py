#!/usr/bin/env python3
"""
Warm-up script to keep server alive and pre-load ML models.

Call this every 10 minutes to prevent cold starts.
In Leapcell, add as a second cron job:
    Schedule: */10 * * * *
    Command: cd backend && python -m app.cron.warmup
"""

import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def warmup():
    """Pre-load ML models to prevent cold starts."""
    logger.info("Starting warmup - loading ML models...")

    try:
        # Import and initialize engines (triggers lazy loading)
        from app.services.predictive_engine import predictive_engine
        from app.services.prescriptive_engine import prescriptive_engine
        from app.services.data_fetcher import data_fetcher

        # Access properties to trigger initialization
        _ = predictive_engine.is_loaded()
        _ = prescriptive_engine.is_initialized()
        _ = data_fetcher.get_all_districts()

        logger.info("Warmup complete - all models loaded and ready")

    except Exception as e:
        logger.error(f"Warmup failed: {e}")


if __name__ == "__main__":
    warmup()
