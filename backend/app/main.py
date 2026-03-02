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


async def background_init():
    """Initialize heavy resources in background to prevent startup timeout."""
    import asyncio

    # Wait a bit for server to fully start accepting requests
    await asyncio.sleep(2)

    print(f"[{settings.app_name}] Background init starting...")

    # Pre-load ML models
    try:
        from app.services.predictive_engine import predictive_engine
        from app.services.prescriptive_engine import prescriptive_engine
        from app.services.data_fetcher import data_fetcher

        _ = predictive_engine.is_loaded()
        _ = prescriptive_engine.is_initialized()
        _ = data_fetcher.get_all_districts()

        print(f"[{settings.app_name}] All engines loaded!")
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Engine load failed: {e}")

    # Start scheduler
    try:
        from app.scheduler import (
            setup_scheduler,
            start_scheduler,
            run_initial_computation_if_needed,
        )

        setup_scheduler()
        start_scheduler()
        await run_initial_computation_if_needed()

        print(f"[{settings.app_name}] Scheduler started!")
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Scheduler failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PURPOSE: Global startup/shutdown logic.
    WHY: Fast startup, heavy init done in background.
    """
    # --- Startup ---
    print(f"[{settings.app_name}] Starting up...")

    # Start background initialization (doesn't block startup)
    asyncio.create_task(background_init())
    print(f"[{settings.app_name}] Background init started...")

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
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=settings.debug
    )
