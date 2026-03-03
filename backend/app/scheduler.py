"""
APScheduler - In-process task scheduler for daily rankings computation.

This module sets up a background scheduler that runs inside the FastAPI app.
It computes district rankings daily at 5:00 AM IST without needing external cron services.

Flow:
1. Scheduler starts when FastAPI app starts
2. At 5:00 AM daily, triggers rankings computation
3. Results saved to SQLite database
4. Users get instant data (<1s) when they login
"""

import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def run_daily_rankings(force: bool = False) -> int:
    """Compute rankings for all districts and save to database.

    Args:
        force: If True, recompute all districts even if they already have data.

    Returns:
        Number of districts processed and saved.
    """
    logger.info("=" * 60)
    logger.info("Starting daily rankings computation")
    if force:
        logger.info("FORCE MODE: Recomputing all districts")
    logger.info("=" * 60)

    start_time = datetime.now()
    total_processed = 0

    try:
        # Import here to avoid circular imports
        from app.services.data_fetcher import data_fetcher
        from app.services.predictive_engine import predictive_engine
        from app.services.db_manager import db_manager
        from app.api.routes import _get_district_coords

        today_str = datetime.now().strftime("%Y-%m-%d")

        # Get all districts
        all_districts = data_fetcher.get_all_districts()
        logger.info(f"Processing {len(all_districts)} districts")

        if force:
            # Force recomputation of all districts
            districts_to_process = all_districts
            # Note: We don't delete old data here - INSERT OR REPLACE will overwrite
            # This ensures the database is never empty during computation
        else:
            # Check which districts already have data
            existing = db_manager.get_results_for_date(today_str)
            existing_names = set(r["district_name"] for r in existing)

            districts_to_process = [d for d in all_districts if d not in existing_names]

            if not districts_to_process:
                logger.info("All districts already computed for today")
                return len(existing)

        logger.info(f"New districts to process: {len(districts_to_process)}")

        # Process in batches of 50
        batch_size = 50
        all_results = []
        total_batches = (len(districts_to_process) + batch_size - 1) // batch_size

        for batch_num, i in enumerate(
            range(0, len(districts_to_process), batch_size), 1
        ):
            batch = districts_to_process[i : i + batch_size]
            logger.info(
                f"Processing batch {batch_num}/{total_batches} ({len(batch)} districts)"
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
            total_processed = inserted
            logger.info(f"Saved {inserted} district results to database")

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Daily computation completed in {duration:.2f}s")
        logger.info("=" * 60)

        return total_processed

    except Exception as e:
        logger.error(f"Daily computation failed: {e}")
        logger.error("=" * 60)
        raise


async def run_initial_computation_if_needed() -> int:
    """Run computation on startup if no fresh data exists.

    Returns:
        Number of districts processed (0 if no computation needed)
    """
    try:
        from app.services.db_manager import db_manager

        today_str = datetime.now().strftime("%Y-%m-%d")
        existing = db_manager.get_results_for_date(today_str)

        # DEBUG: Print what we found
        print(f"[DEBUG] existing data: {len(existing)} records", flush=True)

        # Check if we have fresh data (computed in last 30 minutes)
        has_fresh = db_manager.has_fresh_data(max_age_minutes=30)

        # DEBUG: Print freshness check
        print(f"[DEBUG] has_fresh_data: {has_fresh}", flush=True)

        if not existing:
            print(f"[DEBUG] No existing data - computing now!", flush=True)
            logger.info("No data found for today. Running initial computation...")
            return await run_daily_rankings(force=True)
        elif not has_fresh:
            print(f"[DEBUG] Data exists but stale - recomputing!", flush=True)
            logger.info(
                f"Found {len(existing)} records but data is stale. Recomputing..."
            )
            return await run_daily_rankings(force=True)
        else:
            print(
                f"[DEBUG] Data exists and is fresh - skipping computation", flush=True
            )
            logger.info(f"Found {len(existing)} fresh records for today")
            return len(existing)

    except Exception as e:
        logger.error(f"Initial computation check failed: {e}")
        return 0


def setup_scheduler():
    """Configure and return the scheduler."""

    # Daily at 5:00 AM IST (11:30 PM UTC previous day)
    # Cron format: minute hour day month day_of_week
    scheduler.add_job(
        run_daily_rankings,
        trigger=CronTrigger(hour=5, minute=0),  # 5:00 AM daily
        id="daily_rankings",
        name="Compute daily district rankings",
        replace_existing=True,
    )

    logger.info("Scheduler configured: Daily rankings at 5:00 AM IST")
    return scheduler


def start_scheduler():
    """Start the scheduler."""
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")
    else:
        logger.info("Scheduler already running")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shutdown")


def get_scheduler_status():
    """Get current scheduler status."""
    return {
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time) if job.next_run_time else None,
            }
            for job in scheduler.get_jobs()
        ],
    }


async def generate_synthetic_history(days: int = 7):
    """
    PURPOSE: Generate synthetic historical data for testing 7-day trends.

    This creates fake historical records for all districts to populate the
    7-day trend chart. The synthetic data will naturally be replaced by
    real data as the scheduler runs daily.

    Args:
        days: Number of days of history to generate (default: 7)
    """
    logger.info(f"Generating {days} days of synthetic historical data...")

    try:
        from app.services.data_fetcher import data_fetcher
        from app.services.db_manager import db_manager
        from app.api.routes import _get_district_coords
        from datetime import datetime, timedelta
        import random

        all_districts = data_fetcher.get_all_districts()
        today = datetime.now()
        total_created = 0

        # Generate data for past N days
        for day_offset in range(days, 0, -1):
            date_obj = today - timedelta(days=day_offset)
            date_str = date_obj.strftime("%Y-%m-%d")

            # Check if data already exists for this date
            existing = db_manager.get_results_for_date(date_str)
            if existing:
                logger.info(f"Data already exists for {date_str}, skipping")
                continue

            synthetic_results = []

            for district_name in all_districts:
                # Get base census data for realistic values
                census_data = data_fetcher.get_district_census(district_name)

                # Generate realistic synthetic values with some randomness
                base_temp = 30.0 + random.uniform(-5, 8)  # 25-38°C
                base_humidity = 50.0 + random.uniform(-15, 20)  # 35-70%
                base_lst = base_temp + random.uniform(0, 5)  # LST slightly higher

                # Generate risk score with some randomness
                base_risk = random.uniform(0.2, 0.8)
                heat_index = base_temp + (base_humidity / 100) * 5

                # Determine risk status
                if base_risk > 0.7:
                    risk_status = "Red"
                elif base_risk > 0.4:
                    risk_status = "Amber"
                else:
                    risk_status = "Green"

                coords = _get_district_coords(district_name)

                result_item = {
                    "district_name": district_name,
                    "lat": (coords or {}).get("lat"),
                    "lon": (coords or {}).get("lon"),
                    "risk_score": round(base_risk, 2),
                    "risk_status": risk_status,
                    "heat_index": round(heat_index, 2),
                    "max_temp": round(base_temp, 2),
                    "humidity": round(base_humidity, 2),
                    "lst": round(base_lst, 2),
                    "pct_children": census_data.get("pct_children", 0.3)
                    if census_data
                    else 0.3,
                    "pct_outdoor_workers": census_data.get("pct_outdoor_workers", 0.4)
                    if census_data
                    else 0.4,
                    "pct_vulnerable_social": census_data.get(
                        "pct_vulnerable_social", 0.2
                    )
                    if census_data
                    else 0.2,
                }
                synthetic_results.append(result_item)

            # Save synthetic results
            if synthetic_results:
                inserted = db_manager.save_results_bulk(synthetic_results)
                total_created += inserted
                logger.info(f"Created {inserted} synthetic records for {date_str}")

        logger.info(
            f"Synthetic history generation complete! Total: {total_created} records"
        )
        return total_created

    except Exception as e:
        logger.error(f"Error generating synthetic history: {e}")
        return 0
