"""
CONTEXT: Main Entry Point - Initializes the FastAPI application.
NEIGHBORHOOD:
    - Imports from: app/api/routes, app/core/config

PURPOSE: Configures the ASGI application, middleware (CORS), and startup events.
"""

import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.api.routes import router as api_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PURPOSE: Global startup/shutdown logic.
    WHY: Handles resource initialization (ML Models, DB connections) before accepting requests.
    NOTE: Engines use lazy loading - they will initialize on first request.
    """
    # --- Startup ---
    print(f"[{settings.app_name}] Starting up...")

    # Pre-load ML models during startup to prevent cold start delays
    print(f"[{settings.app_name}] Pre-loading ML models...")
    try:
        from app.services.predictive_engine import predictive_engine
        from app.services.prescriptive_engine import prescriptive_engine
        from app.services.data_fetcher import data_fetcher

        # Access properties to trigger initialization
        _ = predictive_engine.is_loaded()
        _ = prescriptive_engine.is_initialized()
        _ = data_fetcher.get_all_districts()

        print(f"[{settings.app_name}] All engines loaded and ready!")
    except Exception as e:
        print(f"[{settings.app_name}] Warning: Failed to pre-load engines: {e}")
        print(f"[{settings.app_name}] Engines will load on first request.")

    yield

    # --- Shutdown ---
    print(f"[{settings.app_name}] Shutting down...")


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
async def healthcheck():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=settings.debug
    )
