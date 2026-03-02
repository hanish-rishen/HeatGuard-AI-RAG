#!/usr/bin/env python3
"""
Benchmark test for rankings endpoint optimization.

Usage:
    cd backend
    python benchmarks/test_rankings.py
"""

import asyncio
import time
from datetime import datetime

# Import services
from app.services.data_fetcher import data_fetcher
from app.services.predictive_engine import predictive_engine
from app.services.db_manager import db_manager


async def benchmark_weather_fetching():
    """Compare individual vs batch weather fetching."""
    print("\n=== Weather Fetching Benchmark ===")

    districts = data_fetcher.get_all_districts()[:50]  # Test with 50 districts
    today = datetime.now().strftime("%Y-%m-%d")

    # Test individual fetching (old method)
    print("Testing individual fetching (10 districts)...")
    start = time.time()
    for district in districts[:10]:
        await data_fetcher.fetch_nasa_weather_async(district, today)
    individual_time = time.time() - start
    print(f"  Individual (10 districts): {individual_time:.2f}s")

    # Test batch fetching (new method)
    print("Testing batch fetching (50 districts)...")
    start = time.time()
    await data_fetcher.fetch_weather_batch(districts, today)
    batch_time = time.time() - start
    print(f"  Batch (50 districts): {batch_time:.2f}s")

    # Calculate improvement
    if individual_time > 0:
        improvement = (individual_time * 5) / batch_time  # Extrapolate to 50
        print(f"  Estimated improvement: {improvement:.1f}x faster")


async def benchmark_bulk_insert():
    """Compare individual vs bulk DB inserts."""
    print("\n=== Database Insert Benchmark ===")

    # Create test data
    test_results = []
    for i in range(100):
        test_results.append(
            {
                "district_name": f"TestDistrict{i}",
                "lat": 20.0 + i * 0.01,
                "lon": 77.0 + i * 0.01,
                "risk_score": 0.5,
                "risk_status": "Green",
                "heat_index": 35.0,
                "max_temp": 40.0,
                "humidity": 60.0,
                "lst": 42.0,
                "pct_children": 10.0,
                "pct_outdoor_workers": 20.0,
                "pct_vulnerable_social": 30.0,
            }
        )

    # Test individual inserts
    print("Testing individual inserts (100 records)...")
    start = time.time()
    for result in test_results:
        try:
            db_manager.save_result(result)
        except Exception:
            pass  # Ignore unique constraint errors
    individual_time = time.time() - start
    print(f"  Individual: {individual_time:.2f}s")

    # Test bulk insert
    print("Testing bulk insert (100 records)...")
    # Modify names to avoid unique constraint
    for r in test_results:
        r["district_name"] = f"BulkTest{r['district_name']}"

    start = time.time()
    db_manager.save_results_bulk(test_results)
    bulk_time = time.time() - start
    print(f"  Bulk: {bulk_time:.2f}s")

    if bulk_time > 0:
        improvement = individual_time / bulk_time
        print(f"  Improvement: {improvement:.1f}x faster")


async def benchmark_predictions():
    """Compare sequential vs batch predictions."""
    print("\n=== Prediction Benchmark ===")

    # Prepare test data
    test_data = []
    for i in range(30):
        test_data.append(
            {
                "district_name": f"TestDistrict{i}",
                "max_temp": 40.0,
                "lst": 42.0,
                "humidity": 60.0,
                "pct_children": 10.0,
                "pct_outdoor_workers": 20.0,
                "pct_vulnerable_social": 30.0,
                "date": datetime.now().strftime("%Y-%m-%d"),
            }
        )

    # Test sequential predictions
    print("Testing sequential predictions (30 districts)...")
    start = time.time()
    for data in test_data:
        predictive_engine.predict(
            district_name=data["district_name"],
            max_temp=data["max_temp"],
            lst=data["lst"],
            humidity=data["humidity"],
            pct_children=data["pct_children"],
            pct_outdoor_workers=data["pct_outdoor_workers"],
            pct_vulnerable_social=data["pct_vulnerable_social"],
            date_str=data["date"],
        )
    sequential_time = time.time() - start
    print(f"  Sequential: {sequential_time:.2f}s")

    # Test batch predictions
    print("Testing batch predictions (30 districts)...")
    start = time.time()
    await predictive_engine.predict_batch(test_data, max_concurrent=30)
    batch_time = time.time() - start
    print(f"  Batch: {batch_time:.2f}s")

    if batch_time > 0:
        improvement = sequential_time / batch_time
        print(f"  Improvement: {improvement:.1f}x faster")


async def main():
    """Run all benchmarks."""
    print("=" * 60)
    print("HeatGuard AI - Optimization Benchmarks")
    print("=" * 60)

    await benchmark_weather_fetching()
    await benchmark_bulk_insert()
    await benchmark_predictions()

    print("\n" + "=" * 60)
    print("Benchmarks completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
