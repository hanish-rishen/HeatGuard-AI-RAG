"""
CONTEXT: Main Entry Point - Initializes the FastAPI application.
NEIGHBORHOOD:
    - Imports from: app/api/routes, app/core/config

PURPOSE: Configures the ASGI application, middleware (CORS), and startup events.
"""

import os

# Hack to fix WinError 1114 with Torch/Numpy on Windows
try:
    import torch
except ImportError:
    pass

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
    print(f"[{settings.app_name}] Engines will initialize lazily on first request.")

    yield

    # --- Shutdown ---
    print(f"[{settings.app_name}] Shutting down...")


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

# CORS Configuration
# WHY: Allow frontend (localhost:5173 usually) to communicate with backend
origins = [
    "http://localhost:3000",
    "http://localhost:5173",  # Vite default
    "http://127.0.0.1:5173",
    "*",  # Permissive for development
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
