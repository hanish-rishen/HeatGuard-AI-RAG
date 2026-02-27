"""
CONTEXT: This is the main configuration module for HeatGuard AI backend.
NEIGHBORHOOD: 
    - Imported by: app/main.py, app/services/*.py, app/api/*.py
    - Imports from: pydantic_settings, environment variables

PURPOSE: Centralizes all configuration settings loaded from environment variables.
"""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    PURPOSE: Application settings loaded from environment variables.
    RELATIONSHIPS: Used by all modules needing configuration values.
    CONSUMERS: main.py, predictive_engine.py, prescriptive_engine.py
    """
    
    # ------------------------------------
    # API Configuration
    # ------------------------------------
    app_name: str = "HeatGuard AI"
    app_version: str = "1.0.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    
    # ------------------------------------
    # Model Paths (relative to backend dir)
    # ------------------------------------
    model_path: str = "../Models/heat_health_model_v1.pkl"
    encoder_path: str = "../Models/district_encoder.pkl"
    
    # ------------------------------------
    # ChromaDB Configuration
    # ------------------------------------
    chroma_persist_dir: str = "./chroma_db"
    chroma_collection_name: str = "heat_action_plans"
    
    # ------------------------------------
    # Mistral AI Configuration
    # ------------------------------------
    mistral_api_key: Optional[str] = None
    mistral_model: str = "mistral-small-latest"

    # ------------------------------------
    # Authentication (JWT)
    # ------------------------------------
    auth_admin_username: str = "admin"
    auth_admin_password: str = "admin123"
    auth_admin_password_hash: Optional[str] = None
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    
    # ------------------------------------
    # Risk Thresholds for RAG Status
    # ------------------------------------
    # WHY: These thresholds determine when to trigger RAG retrieval
    # Based on Heat Index and predicted hospitalization load
    risk_threshold_green: float = 0.3   # < 0.3 = Low risk (Green)
    risk_threshold_amber: float = 0.6   # 0.3-0.6 = Moderate risk (Amber)
    # > 0.6 = High risk (Red) - triggers full RAG protocol retrieval
    
    class Config:
        """Pydantic config to load from .env file."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """
    PURPOSE: Returns cached Settings instance (singleton pattern).
    RELATIONSHIPS: Called by FastAPI dependency injection.
    CONSUMERS: All route handlers and services.
    
    WHY: Using lru_cache ensures settings are loaded only once at startup.
    """
    return Settings()


# Convenience function to get backend directory
def get_backend_dir() -> Path:
    """Returns the absolute path to the backend directory."""
    return Path(__file__).parent.parent.parent
