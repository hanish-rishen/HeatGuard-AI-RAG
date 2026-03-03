"""
CONTEXT: Pydantic models (schemas) for request/response validation.
NEIGHBORHOOD:
    - Imported by: app/api/routes.py
    - Imports from: pydantic

PURPOSE: Defines strict data validation for all API payloads using Pydantic.
"""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator


class DistrictData(BaseModel):
    """
    PURPOSE: Input data for a single district analysis.
    RELATIONSHIPS: Used in AnalysisRequest.
    CONSUMERS: /analyze endpoint

    The Three Pillars of Risk:
    - Exposure: Max_Temp, LST, Humidity
    - Sensitivity: pct_children, pct_outdoor_workers
    - Adaptive Capacity: pct_vulnerable_social, AC_access (optional)
    """

    # ------------------------------------
    # District Identification
    # ------------------------------------
    district_name: str = Field(
        ...,
        description="Name of the district (must be one of 640 supported districts)",
        examples=["Adilabad", "Narmada", "Ahmedabad"],
    )

    # ------------------------------------
    # Exposure Pillar (Environmental Data)
    # ------------------------------------
    max_temp: float = Field(
        ..., ge=-50, le=60, description="Maximum air temperature at 2 meters (°C)"
    )
    lst: float = Field(
        ...,
        ge=-50,
        le=80,
        description="Land Surface Temperature / Earth Skin Temperature (°C)",
    )
    humidity: float = Field(
        ..., ge=0, le=100, description="Relative Humidity at 2 meters (%)"
    )

    # ------------------------------------
    # Sensitivity Pillar (Demographic Data)
    # ------------------------------------
    pct_children: float = Field(
        ..., ge=0, le=100, description="Percentage of children in population"
    )
    pct_outdoor_workers: float = Field(
        ..., ge=0, le=100, description="Percentage of outdoor/manual laborers"
    )

    # ------------------------------------
    # Adaptive Capacity Pillar (Social Data)
    # ------------------------------------
    pct_vulnerable_social: float = Field(
        ..., ge=0, le=100, description="Percentage of vulnerable social groups"
    )

    # ------------------------------------
    # Date for Temporal Features
    # ------------------------------------
    date: str = Field(
        ...,
        description="Date for prediction (YYYY-MM-DD format)",
        examples=["2025-05-15", "2024-06-20"],
    )

    @field_validator("date")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        """Validate date is in correct format."""
        from datetime import datetime

        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class AnalysisRequest(BaseModel):
    """
    PURPOSE: Request body for the /analyze endpoint.
    RELATIONSHIPS: Contains DistrictData.
    CONSUMERS: /analyze POST endpoint
    """

    district_data: DistrictData


class SourceDocument(BaseModel):
    """
    PURPOSE: Represents a source document retrieved from ChromaDB.
    RELATIONSHIPS: Used in AnalysisResponse.
    CONSUMERS: Frontend RAG display
    """

    content: str = Field(..., description="Relevant text chunk from the document")
    source: str = Field(..., description="Document filename/source")
    page: Optional[int] = Field(None, description="Page number if available")
    similarity_score: float = Field(..., description="Semantic similarity score (0-1)")


class AnalysisResponse(BaseModel):
    """
    PURPOSE: Response from the /analyze endpoint.
    RELATIONSHIPS: Returned by predictive + prescriptive engines.
    CONSUMERS: Frontend dashboard

    Contains:
    - Prediction: Expected hospitalization load
    - Risk Status: Visual RAG status (Red/Amber/Green)
    - Prescriptive Advice: Actionable recommendations from HAP documents
    """

    # ------------------------------------
    # Prediction Results
    # ------------------------------------
    predicted_hospitalization_load: float = Field(
        ..., description="Expected number of heat-related hospitalizations"
    )
    heat_index: float = Field(
        ..., description="Calculated Heat Index using Rothfusz Regression (°C)"
    )
    lst: float = Field(..., description="Land Surface Temperature (°C)")

    # ------------------------------------
    # Risk Classification
    # ------------------------------------
    risk_status: Literal["Green", "Amber", "Red"] = Field(
        ..., description="Visual risk status based on prediction thresholds"
    )
    risk_level_description: str = Field(
        ..., description="Human-readable description of the risk level"
    )

    # ------------------------------------
    # Prescriptive RAG Output
    # ------------------------------------
    prescriptive_advice: str = Field(
        ..., description="AI-synthesized actionable advice from HAP documents"
    )
    source_documents: List[SourceDocument] = Field(
        default_factory=list, description="Source documents used for generating advice"
    )

    # ------------------------------------
    # Metadata
    # ------------------------------------
    district_name: str = Field(..., description="Name of the analyzed district")
    analysis_date: str = Field(..., description="Date of analysis")
    model_version: str = Field("v1.0", description="Model version used")


class MortalityRiskItem(BaseModel):
    """
    PURPOSE: Mortality risk per district using NFHS disease indicators.
    """

    district_name: str
    heat_risk_score: float
    heat_risk_date: str | None = None
    mortality_risk_score: float
    mortality_disease_index: float
    mortality_risk_reason: str | None = None

    @field_validator("heat_risk_date", mode="before")
    @classmethod
    def convert_date_to_string(cls, v):
        """Convert datetime.date to string for PostgreSQL compatibility."""
        if v is None:
            return None
        if hasattr(v, "strftime"):  # datetime.date or datetime.datetime
            return v.strftime("%Y-%m-%d")
        return str(v)


class MortalityRiskResponse(BaseModel):
    """
    PURPOSE: Response for mortality risk analytics endpoint.
    """

    total_districts: int
    as_of_date: str | None = None
    items: list[MortalityRiskItem]


class HealthCheckResponse(BaseModel):
    """
    PURPOSE: Response for health check endpoint.
    CONSUMERS: Load balancers, monitoring systems
    """

    status: str = "healthy"
    model_loaded: bool = False
    chroma_connected: bool = False
    version: str = "1.0.0"


class DocumentUploadResponse(BaseModel):
    """
    PURPOSE: Response after uploading documents to ChromaDB.
    CONSUMERS: Frontend data sources view
    """

    filename: Optional[str] = None
    status: str = "success"
    message: str
    chunks_processed: int = 0


class ChatRequest(BaseModel):
    """
    PURPOSE: Request payload for general chat RAG.
    CONSUMERS: /chat endpoint
    """

    query: str = Field(..., description="User's natural language query")

    # Optional additional context coming from the UI (e.g., latest district analysis summary)
    district_context: Optional[str] = Field(
        None, description="Optional district analysis context to ground the chat answer"
    )


class LoginRequest(BaseModel):
    """
    PURPOSE: Request payload for login.
    CONSUMERS: /auth/login endpoint
    """

    username: str = Field(..., description="Admin username")
    password: str = Field(..., description="Admin password")


class TokenResponse(BaseModel):
    """
    PURPOSE: Response payload for access tokens.
    CONSUMERS: Frontend login flow
    """

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field("bearer", description="Token type")
    expires_in: int = Field(..., description="Expiration in seconds")
