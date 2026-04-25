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
effective_database_url = settings.get_effective_database_url()
database_type = (
    "SQLite (Local File)"
    if effective_database_url.startswith("sqlite")
    else "PostgreSQL (Remote)"
)


def _mask_database_url(database_url: str) -> str:
    if not database_url:
        return "Not set (using SQLite)"
    if database_url.startswith("sqlite:///"):
        return f"sqlite:///.../{database_url.split('/')[-1]}"
    if "@" in database_url:
        return database_url.split("@")[0] + "@..."
    return database_url


masked_database_url = _mask_database_url(effective_database_url)

# Log startup mode information
print(f"[{settings.app_name}] {'=' * 50}", flush=True)
print(f"[{settings.app_name}] STARTUP MODE INFORMATION", flush=True)
print(f"[{settings.app_name}] {'=' * 50}", flush=True)
print(
    f"[{settings.app_name}] Local Mode: {'ENABLED' if settings.use_local_mode else 'DISABLED'}",
    flush=True,
)
print(
    f"[{settings.app_name}] Presentation Mode: {'ENABLED' if settings.presentation_mode else 'DISABLED'}",
    flush=True,
)
print(
    f"[{settings.app_name}] Database: {database_type}",
    flush=True,
)
print(
    f"[{settings.app_name}] Database URL: {masked_database_url}",
    flush=True,
)
print(f"[{settings.app_name}] Debug Mode: {settings.debug}", flush=True)
print(f"[{settings.app_name}] {'=' * 50}", flush=True)

# Global flag to track server readiness
_server_ready = False


async def background_init():
    """Initialize heavy resources in background to prevent startup timeout."""
    global _server_ready
    import asyncio

    # Wait a bit for server to fully start accepting requests
    await asyncio.sleep(2)

    print(f"[{settings.app_name}] Background init starting...", flush=True)

    # Warm up lightweight metadata only; keep heavy ML/vector resources lazy.
    try:
        from app.services.data_fetcher import data_fetcher

        _ = data_fetcher.get_all_districts()

        print(f"[{settings.app_name}] Background metadata warmup complete.", flush=True)
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Metadata warmup failed: {e}", flush=True)
        return  # Don't mark ready if engines failed

    if settings.enable_scheduler:
        # Start scheduler and run initial computation (only if needed)
        try:
            from app.scheduler import (
                setup_scheduler,
                start_scheduler,
                run_initial_computation_if_needed,
            )

            setup_scheduler()
            start_scheduler()

            # Only compute if data is missing or stale
            print(f"[{settings.app_name}] Checking for existing data...", flush=True)
            await run_initial_computation_if_needed()
            print(f"[{settings.app_name}] Data check complete!", flush=True)

            # Small delay to ensure database transaction is fully committed
            await asyncio.sleep(1)

            print(f"[{settings.app_name}] Scheduler started!", flush=True)
        except Exception as e:
            print(f"[{settings.app_name}] Warning: Scheduler failed: {e}", flush=True)
            # Continue - we'll check for data separately
    else:
        # Recommended for Render free-tier demos to reduce startup RAM and background CPU.
        print(
            f"[{settings.app_name}] Scheduler disabled (ENABLE_SCHEDULER=false).",
            flush=True,
        )

    # Clear any stale Redis cache to ensure fresh data is served
    try:
        from datetime import datetime
        from app.services.cache_manager import cache_manager, USE_REDIS

        if USE_REDIS and cache_manager:
            today_str = datetime.now().strftime("%Y-%m-%d")
            # Invalidate today's rankings cache
            cache_manager.delete(f"rankings:{today_str}")
            print(
                f"[{settings.app_name}] Cleared stale Redis cache for {today_str}",
                flush=True,
            )
    except Exception as cache_error:
        print(
            f"[{settings.app_name}] Warning: Could not clear cache: {cache_error}",
            flush=True,
        )

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


def _normalize_origin(origin: str) -> str:
    """Trim whitespace and surrounding quotes from a CORS origin entry."""
    return origin.strip().strip("'\"")


if cors_origins_env and cors_origins_env.strip():
    # Production: use specific origins from env var (comma-separated)
    origins = [
        _normalize_origin(origin)
        for origin in cors_origins_env.split(",")
        if _normalize_origin(origin)
    ]
    allow_origin_regex = None
else:
    # Development: allow common local development ports
    origins = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "https://heatguard-ai.vercel.app",
        "https://heatguard-frontend.onrender.com",
    ]
    allow_origin_regex = None

print(f"[{settings.app_name}] CORS origins: {origins}", flush=True)
if allow_origin_regex:
    print(
        f"[{settings.app_name}] CORS allow_origin_regex: {allow_origin_regex}",
        flush=True,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
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

    # Check data availability
    data_count = 0
    try:
        from datetime import datetime
        from app.services.db_manager import db_manager

        today_str = datetime.now().strftime("%Y-%m-%d")
        existing = db_manager.get_results_for_date(today_str)
        data_count = len(existing) if existing else 0
    except Exception:
        pass

    # Consider ready if we have data for today (regardless of freshness)
    # The scheduler will refresh stale data in the background
    has_data = data_count > 0

    return {
        "status": "ok",
        "ready": _server_ready or has_data,  # Ready if marked ready OR has data
        "data_available": has_data,
        "data_fresh": _server_ready,  # Fresh only if computed recently
        "districts_loaded": data_count,
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=settings.debug
    )
