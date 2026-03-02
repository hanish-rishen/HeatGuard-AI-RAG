#!/usr/bin/env python3
"""
Daily Cron Job - Pre-compute district rankings at 5:00 AM IST.

This script fetches weather data for all 640 districts and computes
risk scores, saving results to the database for fast user access.

Configuration in Leapcell:
    Schedule: 0 5 * * *
    Command: cd backend && python -m app.cron.daily_rankings
"""

import asyncio
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)


async def precompute_daily_rankings():
    """Pre-compute rankings for all districts."""
    logger.info("Starting daily rankings pre-computation")
    start_time = datetime.now()

    try:
        # Import services
        from app.services.data_fetcher import data_fetcher
        from app.services.predictive_engine import predictive_engine
        from app.services.db_manager import db_manager
        from app.api.routes import _get_district_coords

        today_str = datetime.now().strftime("%Y-%m-%d")

        # Get all districts
        all_districts = data_fetcher.get_all_districts()
        logger.info(f"Processing {len(all_districts)} districts")

        # Check which districts already have data
        existing = db_manager.get_results_for_date(today_str)
        existing_names = set(r["district_name"] for r in existing)

        districts_to_process = [d for d in all_districts if d not in existing_names]
        logger.info(f"New districts to process: {len(districts_to_process)}")

        if not districts_to_process:
            logger.info("All districts already computed for today")
            return

        # Process in batches of 50
        batch_size = 50
        all_results = []

        for i in range(0, len(districts_to_process), batch_size):
            batch = districts_to_process[i : i + batch_size]
            logger.info(
                f"Processing batch {i // batch_size + 1}/{(len(districts_to_process) + batch_size - 1) // batch_size}"
            )

            # Batch fetch weather
            weather_map = await data_fetcher.fetch_weather_batch(batch, today_str)

            # Prepare for prediction
            districts_with_data = []
            for district_name in batch:
                weather_data = weather_map.get(district_name)
                if not weather_data:
                    continue

                census_data = data_fetcher.get_district_census(district_name)
                if not census_data:
                    continue

                districts_with_data.append(
                    {
                        "district_name": district_name,
                        **weather_data,
                        **census_data,
                        "date": today_str,
                    }
                )

            if not districts_with_data:
                continue

            # Batch predict
            predictions = await predictive_engine.predict_batch(
                districts_with_data, max_concurrent=30
            )

            # Build results
            for j, (pred_load, heat_index) in enumerate(predictions):
                data = districts_with_data[j]
                district_name = data["district_name"]

                risk_status = (
                    "Red"
                    if pred_load > 0.8
                    else "Amber"
                    if pred_load > 0.5
                    else "Green"
                )

                coords = _get_district_coords(district_name)

                result_item = {
                    "district_name": district_name,
                    "lat": (coords or {}).get("lat"),
                    "lon": (coords or {}).get("lon"),
                    "risk_score": float(pred_load),
                    "risk_status": risk_status,
                    "heat_index": float(heat_index),
                    "max_temp": data["max_temp"],
                    "humidity": data["humidity"],
                    "lst": data["lst"],
                    "pct_children": data["pct_children"],
                    "pct_outdoor_workers": data["pct_outdoor_workers"],
                    "pct_vulnerable_social": data["pct_vulnerable_social"],
                }
                all_results.append(result_item)

        # Bulk save all results
        if all_results:
            inserted = db_manager.save_results_bulk(all_results)
            logger.info(f"Saved {inserted} district results to database")

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Daily pre-computation completed in {duration:.2f}s")

    except Exception as e:
        logger.error(f"Daily pre-computation failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(precompute_daily_rankings())
