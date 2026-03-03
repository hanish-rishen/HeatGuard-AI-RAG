"""
CONTEXT: Main Entry Point - Initializes the FastAPI application.
NEIGHBORHOOD:
    - Imports from: app/api/routes, app/core/config

PURPOSE: Configures the ASGI application, middleware (CORS), and startup events.
"""

import os
import asyncio

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.api.routes import router as api_router

settings = get_settings()

# Global flag to track server readiness
_server_ready = False


async def background_init():
    """Initialize heavy resources in background to prevent startup timeout."""
    global _server_ready
    import asyncio

    # Wait a bit for server to fully start accepting requests
    await asyncio.sleep(2)

    print(f"[{settings.app_name}] Background init starting...", flush=True)

    # Pre-load ML models
    try:
        from app.services.predictive_engine import predictive_engine
        from app.services.prescriptive_engine import prescriptive_engine
        from app.services.data_fetcher import data_fetcher

        _ = predictive_engine.is_loaded()
        _ = prescriptive_engine.is_initialized()
        _ = data_fetcher.get_all_districts()

        print(f"[{settings.app_name}] All engines loaded!", flush=True)
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Engine load failed: {e}", flush=True)
        return  # Don't mark ready if engines failed

    # Start scheduler and run initial computation (only if needed - saves Leapcell resources)
    try:
        from app.scheduler import (
            setup_scheduler,
            start_scheduler,
            run_initial_computation_if_needed,
        )

        setup_scheduler()
        start_scheduler()

        # Only compute if data is missing or stale (saves Leapcell resources)
        print(f"[{settings.app_name}] Checking for existing data...", flush=True)
        await run_initial_computation_if_needed()
        print(f"[{settings.app_name}] Data check complete!", flush=True)

        # Small delay to ensure database transaction is fully committed
        await asyncio.sleep(1)

        print(f"[{settings.app_name}] Scheduler started!", flush=True)
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Scheduler failed: {e}", flush=True)
        # Continue - we'll check for data separately

    # Wait for data to be ready (ensure ALL districts are computed)
    try:
        from datetime import datetime
        from app.services.db_manager import db_manager
        from app.services.data_fetcher import data_fetcher

        print(
            f"[{settings.app_name}] Waiting for data computation to complete...",
            flush=True,
        )

        # Get expected district count
        all_districts = data_fetcher.get_all_districts()
        expected_count = len(all_districts)
        print(
            f"[{settings.app_name}] Expecting {expected_count} districts...",
            flush=True,
        )

        # Poll every 2 seconds for up to 2 minutes
        max_wait_seconds = 120
        poll_interval = 2
        waited = 0

        while waited < max_wait_seconds:
            today_str = datetime.now().strftime("%Y-%m-%d")
            existing = db_manager.get_results_for_date(today_str)
            existing_count = len(existing) if existing else 0

            # Check if we have ALL districts (or at least 95% to account for data issues)
            if existing_count >= expected_count * 0.95:
                # All data ready! Mark server as ready
                print(
                    f"[{settings.app_name}] Server is fully ready! ({existing_count}/{expected_count} districts loaded)",
                    flush=True,
                )
                _server_ready = True
                break
            elif existing_count > 0:
                # Partial data - still computing
                print(
                    f"[{settings.app_name}] Data loading... ({existing_count}/{expected_count} districts)",
                    flush=True,
                )

            # Wait and try again
            await asyncio.sleep(poll_interval)
            waited += poll_interval

            if waited % 10 == 0:
                print(
                    f"[{settings.app_name}] Still waiting for data... ({waited}s)",
                    flush=True,
                )

        if not _server_ready:
            print(
                f"[{settings.app_name}] Warning: Timed out waiting for data. Server NOT ready.",
                flush=True,
            )
            # Don't mark ready - let the frontend keep polling
        else:
            # Check if we need synthetic history for 7-day trends
            try:
                from datetime import datetime, timedelta
                from app.scheduler import generate_synthetic_history

                # Check if we have at least 3 days of historical data
                past_dates = []
                for i in range(1, 4):  # Check past 3 days
                    date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
                    existing = db_manager.get_results_for_date(date_str)
                    if existing and len(existing) > 0:
                        past_dates.append(date_str)

                if len(past_dates) < 2:  # Less than 2 days of history
                    print(
                        f"[{settings.app_name}] Generating synthetic 7-day history for trends...",
                        flush=True,
                    )
                    await generate_synthetic_history(days=7)
                    print(
                        f"[{settings.app_name}] Synthetic history generated!",
                        flush=True,
                    )
            except Exception as synth_error:
                print(
                    f"[{settings.app_name}] Warning: Could not generate synthetic history: {synth_error}",
                    flush=True,
                )

    except Exception as e:
        print(f"[{settings.app_name}] Warning: Data check failed: {e}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PURPOSE: Global startup/shutdown logic.
    WHY: Fast startup, heavy init done in background.
    """
    # --- Startup ---
    print(f"[{settings.app_name}] Starting up...", flush=True)

    # Start background initialization (doesn't block startup)
    asyncio.create_task(background_init())
    print(f"[{settings.app_name}] Background init started...", flush=True)

    yield

    # --- Shutdown ---
    print(f"[{settings.app_name}] Shutting down...")
    try:
        from app.scheduler import shutdown_scheduler

        shutdown_scheduler()
    except Exception as e:
        print(f"[{settings.app_name}] Scheduler stop warning: {e}")


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

# CORS Configuration
# WHY: Allow frontend to communicate with backend across different environments
# In production, set CORS_ORIGINS env var to your frontend domain(s)
cors_origins_env = os.getenv("CORS_ORIGINS")
if cors_origins_env:
    # Production: use specific origins from env var (comma-separated)
    origins = [origin.strip() for origin in cors_origins_env.split(",")]
else:
    # Development: allow common local development ports
    origins = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "*",  # Permissive for development - remove in production
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routes
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.app_name} API", "docs_url": "/docs"}


@app.get("/kaithheathcheck")
@app.head("/kaithheathcheck")  # Support HEAD for UptimeRobot
async def healthcheck():
    global _server_ready

    # Check data availability and freshness
    data_count = 0
    is_fresh = False
    try:
        from datetime import datetime
        from app.services.db_manager import db_manager

        today_str = datetime.now().strftime("%Y-%m-%d")
        existing = db_manager.get_results_for_date(today_str)
        data_count = len(existing) if existing else 0
        is_fresh = db_manager.has_fresh_data(max_age_minutes=30)
    except Exception:
        pass

    return {
        "status": "ok",
        "ready": _server_ready,
        "data_available": data_count > 0 and is_fresh,
        "data_fresh": is_fresh,
        "districts_loaded": data_count,
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=settings.debug
    )
