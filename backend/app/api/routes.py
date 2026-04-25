"""
CONTEXT: API Routes - Defines the HTTP endpoints for the application.
NEIGHBORHOOD:
    - Imported by: app/main.py
    - Imports from: app/services/*, app/schemas/models.py

PURPOSE: Orchestrates the request/response flow. Receives data, calls the
predictive/prescriptive engines, and constructs the final response.
"""

from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    File,
    UploadFile,
    BackgroundTasks,
    Request,
)
from datetime import datetime, timedelta
import uuid
import logging
import json
import asyncio
import io
import time
from threading import Lock
from typing import List, Optional, Dict, Any
from fastapi.responses import StreamingResponse
import hashlib
import hmac
import base64
import requests

logger = logging.getLogger(__name__)

# PDF tools (PyMuPDF) - lazy import to keep startup fast
fitz = None
fitz_lock = Lock()


def _get_fitz():
    """Lazy-load PyMuPDF with a lock so concurrent requests initialize it once."""
    global fitz
    with fitz_lock:
        if fitz is not None:
            return fitz
        try:
            import fitz as pymupdf_fitz  # PyMuPDF

            fitz = pymupdf_fitz
            return fitz
        except ImportError as e:
            logger.warning(f"PyMuPDF not found. File uploads might fail. Error: {e}")
        except Exception as e:
            logger.warning(f"Error initializing PDF tools: {e}")
        return None

from app.schemas.models import (
    MortalityRiskResponse,
    MortalityRiskItem,
    AnalysisRequest,
    AnalysisResponse,
    HealthCheckResponse,
    DistrictData,
    SourceDocument,
    DocumentUploadResponse,
    ChatRequest,
    LoginRequest,
    TokenResponse,
)
from app.services.predictive_engine import predictive_engine
from app.services.prescriptive_engine import prescriptive_engine
from app.services.data_fetcher import data_fetcher
from app.services.db_manager import db_manager
from app.services.nfhs_service import nfhs_service
from app.core.config import get_settings

# Try to import cache manager, fallback to None if not available
try:
    from app.services.cache_manager import cache_manager

    CACHE_ENABLED = True
except Exception as e:
    logger.warning(f"Cache manager not available: {e}")
    cache_manager = None
    CACHE_ENABLED = False

router = APIRouter()
settings = get_settings()
effective_database_url = settings.get_effective_database_url()


def _hash_password(password: str, secret: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"), password.encode("utf-8"), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _get_admin_password_hash() -> str:
    if settings.auth_admin_password_hash:
        return settings.auth_admin_password_hash.strip()
    return _hash_password(settings.auth_admin_password, settings.jwt_secret_key)


def _verify_password(password: str) -> bool:
    expected = _get_admin_password_hash()
    provided = _hash_password(password, settings.jwt_secret_key)
    return hmac.compare_digest(expected, provided)


def _generate_access_token(subject: str, expires_delta: timedelta) -> str:
    header = {"alg": settings.jwt_algorithm, "typ": "JWT"}
    now = datetime.utcnow()
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    header_b64 = (
        base64.urlsafe_b64encode(
            json.dumps(header, separators=(",", ":")).encode("utf-8")
        )
        .decode("utf-8")
        .rstrip("=")
    )
    payload_b64 = (
        base64.urlsafe_b64encode(
            json.dumps(payload, separators=(",", ":")).encode("utf-8")
        )
        .decode("utf-8")
        .rstrip("=")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(
        settings.jwt_secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _decode_token(token: str) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token format")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(
        settings.jwt_secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    expected_sig_b64 = (
        base64.urlsafe_b64encode(expected_sig).decode("utf-8").rstrip("=")
    )
    if not hmac.compare_digest(signature_b64, expected_sig_b64):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    padded_payload = payload_b64 + "=" * (-len(payload_b64) % 4)
    try:
        payload_json = base64.urlsafe_b64decode(padded_payload.encode("utf-8")).decode(
            "utf-8"
        )
        payload = json.loads(payload_json)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    exp = payload.get("exp")
    if not isinstance(exp, int) or datetime.utcnow().timestamp() >= exp:
        raise HTTPException(status_code=401, detail="Token expired")
    return payload


def _get_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    token_param = request.query_params.get("token")
    if token_param:
        return token_param
    raise HTTPException(status_code=401, detail="Missing token")


def require_auth(request: Request) -> dict:
    try:
        token = _get_token_from_request(request)
        logger.info(f"Token received: {token[:20]}...")
        payload = _decode_token(token)
        logger.info(f"Token decoded successfully for user: {payload.get('sub')}")
        return payload
    except HTTPException:
        logger.warning(f"Auth failed for request: {request.url}")
        raise
    except Exception as e:
        logger.error(f"Unexpected auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


def _normalize_district_for_geocode(name: str) -> str:
    """Best-effort normalization so district names match geocode keys."""
    if not name:
        return name

    normalized = name.strip()

    # Drop commonly-seen suffixes like "District (M Cl)" in the geocodes dataset.
    # Rankings typically use plain district names.
    if "(" in normalized and normalized.endswith(")"):
        normalized = normalized.split("(", 1)[0].strip()

    # Common spelling variants seen in datasets
    aliases = {
        "Ahmadabad": "Ahmedabad",
        "Ahmadnagar": "Ahmednagar",
    }
    return aliases.get(normalized, normalized)


def _get_district_coords(name: str):
    """Return coords dict {lat, lon} or None."""
    if not name:
        return None

    n = _normalize_district_for_geocode(name)

    # Fast path: exact match
    coords = data_fetcher.district_coords.get(n)
    if coords:
        return coords

    # Case-insensitive match using map built by DataFetcher
    lower_map = getattr(data_fetcher, "district_coords_lower", None)
    if isinstance(lower_map, dict):
        key = lower_map.get(n.casefold())
        if key:
            return data_fetcher.district_coords.get(key)

    # Fallback: try stripping double spaces etc
    coords = data_fetcher.district_coords.get(" ".join(n.split()))
    if coords:
        return coords

    return None


@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """
    PURPOSE: Simple health check to verify system status.
    CONSUMERS: Load balancers, monitoring tools.
    """
    return HealthCheckResponse(
        status="healthy",
        model_loaded=predictive_engine.is_loaded(),
        chroma_connected=prescriptive_engine.is_initialized(),
        version=settings.app_version,
    )


@router.get("/system-status")
async def system_status():
    """
    PURPOSE: Detailed system status including database and Redis.
    """
    status = {
        "status": "healthy",
        "version": settings.app_version,
        "mode": {
            "local_mode": settings.use_local_mode,
            "presentation_mode": settings.presentation_mode,
            "deployment_type": "local"
            if settings.use_local_mode
            else ("deployed" if effective_database_url else "unknown"),
        },
        "database": {"connected": False, "type": "unknown", "records": 0},
        "redis": {"connected": False, "cached_keys": 0},
        "models": {
            "predictive_loaded": predictive_engine.is_loaded(),
            "prescriptive_loaded": prescriptive_engine.is_initialized(),
        },
    }

    # Check database
    try:
        from app.services.db_manager import USE_POSTGRES

        status["database"]["type"] = "PostgreSQL" if USE_POSTGRES else "SQLite"
        count = len(db_manager.get_results_for_date("2026-03-03"))
        status["database"]["connected"] = True
        status["database"]["records"] = count
    except Exception as e:
        status["database"]["error"] = str(e)

    # Check Redis
    if CACHE_ENABLED and cache_manager:
        try:
            # Try to set and get a test key
            cache_manager.set("health_check", {"timestamp": "test"}, ttl=10)
            test_val = cache_manager.get("health_check")
            if test_val:
                status["redis"]["connected"] = True
                status["redis"]["cached_keys"] = (
                    len([k for k in ["health_check"] if cache_manager.get(k)]) or 0
                )
        except Exception as e:
            status["redis"]["error"] = str(e)
    else:
        status["redis"]["status"] = "disabled"

    return status


@router.post("/admin/clear-cache")
async def clear_cache(_: dict = Depends(require_auth)):
    """
    PURPOSE: Clear Redis cache to force fresh data fetch.
    """
    try:
        from datetime import datetime

        cleared = []
        today_str = datetime.now().strftime("%Y-%m-%d")

        # Clear today's rankings cache
        if CACHE_ENABLED and cache_manager:
            cache_manager.delete(f"rankings:{today_str}")
            cleared.append(f"rankings:{today_str}")

            # Clear mortality risk cache
            cache_manager.delete(f"mortality_risk:{today_str}")
            cleared.append(f"mortality_risk:{today_str}")

            # Clear all history caches
            cache_manager.clear_pattern("history:*")
            cleared.append("history:*")

        return {"message": "Cache cleared successfully", "cleared_keys": cleared}
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    # Debug logging for auth issues
    logger.info(f"Login attempt for user: {request.username}")
    logger.info(f"Expected username: {settings.auth_admin_username}")
    logger.info(f"Username match: {request.username == settings.auth_admin_username}")

    if request.username != settings.auth_admin_username:
        logger.warning(
            f"Username mismatch: '{request.username}' != '{settings.auth_admin_username}'"
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    password_valid = _verify_password(request.password)
    logger.info(f"Password valid: {password_valid}")

    if not password_valid:
        logger.warning(f"Password verification failed for user: {request.username}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    expires_minutes = max(1, int(settings.jwt_access_token_expire_minutes))
    expires_delta = timedelta(minutes=expires_minutes)
    token = _generate_access_token(request.username, expires_delta)
    return TokenResponse(
        access_token=token, token_type="bearer", expires_in=expires_minutes * 60
    )


@router.get("/auth/verify")
async def verify_auth(_: dict = Depends(require_auth)):
    return {"status": "ok"}


@router.get("/files", response_model=List[dict])
async def list_files(_: dict = Depends(require_auth)):
    """
    PURPOSE: List all uploaded files/documents for RAG context.
    """
    files = db_manager.get_all_files()
    return files


@router.delete("/files/{filename}")
async def delete_file(filename: str, _: dict = Depends(require_auth)):
    """
    PURPOSE: Delete a file from the system (DB + RAG).
    """
    try:
        # 1. Delete from RAG (Chroma)
        prescriptive_engine.delete_document(filename)

        # 2. Delete from DB (SQLite)
        db_success = db_manager.delete_file_metadata(filename)

        if not db_success:
            logger.warning(f"File {filename} not found in DB during delete request.")
            # We proceed anyway to ensure RAG is clean, but maybe return 404 if truly missing?
            # If RAG had it but DB didn't, it's a sync issue. We return success.
            # If neither had it, maybe 404.
            # Let's keep it simple: if delete_file_metadata returns False, likely it didn't exist.
            # But to be safe over idempotent deletes, we return success.

        return {
            "filename": filename,
            "status": "deleted",
            "message": "File deleted successfully",
        }

    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/sync", response_model=Dict[str, Any])
async def sync_files(_: dict = Depends(require_auth)):
    """
    PURPOSE: Sync file metadata between ChromaDB and SQLite database.
    Identifies orphaned documents in ChromaDB and recreates metadata entries.
    """
    try:
        # 1. Get all files from database
        db_files = {f["filename"]: f for f in db_manager.get_all_files()}
        logger.info(f"Found {len(db_files)} files in database")

        # 2. Get all documents from ChromaDB
        chroma_docs = prescriptive_engine.get_all_document_sources()
        logger.info(f"Found {len(chroma_docs)} unique sources in ChromaDB")

        # 3. Find orphaned documents (in ChromaDB but not in DB)
        orphaned = []
        synced = []

        for doc in chroma_docs:
            filename = doc["filename"]
            if filename not in db_files:
                # This is an orphaned document - recreate metadata
                orphaned.append(
                    {
                        "filename": filename,
                        "chunk_count": doc["chunk_count"],
                        "pages": doc["pages"],
                    }
                )

                # Recreate metadata entry
                db_manager.save_file_metadata(
                    {
                        "filename": filename,
                        "size_bytes": 0,  # Unknown for orphaned docs
                        "content_type": "application/pdf",  # Assume PDF
                        "description": f"Recovered from ChromaDB ({doc['chunk_count']} chunks)",
                        "status": "Indexed",
                    }
                )
                logger.info(f"Recreated metadata for orphaned file: {filename}")
            else:
                synced.append(filename)

        return {
            "status": "sync_complete",
            "database_count": len(db_files),
            "chromadb_count": len(chroma_docs),
            "orphaned_count": len(orphaned),
            "orphaned_files": orphaned,
            "synced_files": synced,
            "message": f"Found {len(orphaned)} orphaned documents and restored their metadata",
        }

    except Exception as e:
        logger.error(f"Sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/orphans", response_model=Dict[str, Any])
async def list_orphaned_files(_: dict = Depends(require_auth)):
    """
    PURPOSE: List documents that exist in ChromaDB but not in the database metadata.
    These are 'orphaned' documents that will be cited by RAG but not shown in the UI.
    """
    try:
        # 1. Get all files from database
        db_files = {f["filename"]: f for f in db_manager.get_all_files()}

        # 2. Get all documents from ChromaDB
        chroma_docs = prescriptive_engine.get_all_document_sources()

        # 3. Find orphaned documents
        orphaned = []
        for doc in chroma_docs:
            if doc["filename"] not in db_files:
                orphaned.append(doc)

        return {
            "orphaned_count": len(orphaned),
            "database_count": len(db_files),
            "chromadb_count": len(chroma_docs),
            "orphaned_files": orphaned,
        }

    except Exception as e:
        logger.error(f"Failed to list orphans: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def process_document_background(
    filename: str, content: bytes, content_type: str, doc_id: str
):
    """
    Background task to process document extraction and indexing.
    Includes granular status updates and detailed logging.
    """
    logger.info(f"STARTING Background Task for {filename} (Type: {content_type})")
    try:
        file_text = ""
        db_manager.update_file_status(filename, "Extracting...")

        # 1. Determine Extraction Strategy
        if content_type == "application/pdf":
            fitz_module = _get_fitz()
            if not fitz_module:
                logger.error("PyMuPDF (fitz) is not available.")
                raise Exception("PyMuPDF (fitz) is not available on server.")

            try:
                # Use PyMuPDF (fitz) for both text and image rendering
                doc = fitz_module.open(stream=content, filetype="pdf")
                total_pages = len(doc)
                logger.info(f"PDF {filename} loaded with {total_pages} pages.")

                text_content = []

                for i, page in enumerate(doc):
                    # Granular Status Update
                    status_msg = f"Processing Page {i + 1}/{total_pages}"
                    db_manager.update_file_status(filename, status_msg)
                    logger.info(f"[{filename}] {status_msg}")

                    # Get native text
                    page_text = page.get_text()
                    text_content.append(page_text)

                file_text = "\n".join(text_content)

            except Exception as e:
                logger.exception(f"Error reading PDF {filename}")
                raise Exception(f"Invalid PDF file: {e}")

        elif content_type == "text/plain":
            file_text = content.decode("utf-8")
        else:
            # Try decoding as text fallback
            try:
                file_text = content.decode("utf-8")
            except:
                pass  # Will fail check below

        if not file_text.strip():
            logger.warning(f"No text extracted from {filename}")
            db_manager.update_file_status(filename, "Warning: Empty")
            return

        # 3. Index into RAG (Chunking simple strategy: 1 doc = 1 file for now)
        db_manager.update_file_status(filename, "Indexing Chunks...")
        logger.info(f"[{filename}] Starting Indexing...")

        chunk_size = 1000
        text_chunks = [
            file_text[i : i + chunk_size] for i in range(0, len(file_text), chunk_size)
        ]

        logger.info(f"[{filename}] Generated {len(text_chunks)} chunks.")

        for i, chunk in enumerate(text_chunks):
            if i > 0 and i % 5 == 0:
                db_manager.update_file_status(
                    filename, f"Indexing {i}/{len(text_chunks)}"
                )

            prescriptive_engine.add_document(
                content=chunk,
                metadata={
                    "source": filename,
                    "type": content_type or "unknown",
                    "chunk_index": i,
                },
                doc_id=f"{doc_id}_{i}",
            )

        db_manager.update_file_status(filename, "Indexed")
        logger.info(f"SUCCESS: Successfully processed and indexed {filename}")

    except Exception as e:
        logger.exception(f"Background processing CRASHED for {filename}")
        db_manager.update_file_status(filename, "Failed")


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    _: dict = Depends(require_auth),
):
    """
    PURPOSE: Upload and process a document (PDF, Image, Text) for the RAG system.
    Using BackgroundTasks to prevent timeout on large files.
    """
    try:
        content = await file.read()

        # 1. Persist Metadata immediately with 'Processing' status
        doc_id = str(uuid.uuid4())
        db_manager.save_file_metadata(
            {
                "filename": file.filename,
                "size_bytes": len(content),
                "content_type": file.content_type,
                "description": "Uploaded via Dashboard",
                "status": "Processing",
            }
        )

        # 2. Trigger Background Processing
        background_tasks.add_task(
            process_document_background,
            file.filename,
            content,
            file.content_type,
            doc_id,
        )

        return DocumentUploadResponse(
            filename=file.filename,
            status="processing",
            chunks_processed=0,
            message="File uploaded. Processing started in background.",
        )

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_district(request: AnalysisRequest, _: dict = Depends(require_auth)):
    """
    PURPOSE: Core endpoint for Heat-Health Analysis.

    Logic Flow:
    1. Validate Input (Pydantic does this)
    2. RUN PREDICTION: Call PredictiveEngine to get hospitalization load & Heat Index.
    3. DETERMINE RISK: Classify into Green/Amber/Red based on thresholds.
    4. QUERY RAG: Fetch relevant HAP protocols from ChromaDB based on risk/keywords.
    5. GENERATE ADVICE: Call PrescriptiveEngine to synthesize advice.
    6. Return combined JSON response.
    """
    data = request.district_data

    # ------------------------------------
    # Step 1: Predictive Model Execution
    # ------------------------------------
    try:
        pred_load, heat_index = predictive_engine.predict(
            district_name=data.district_name,
            max_temp=data.max_temp,
            lst=data.lst,
            humidity=data.humidity,
            pct_children=data.pct_children,
            pct_outdoor_workers=data.pct_outdoor_workers,
            pct_vulnerable_social=data.pct_vulnerable_social,
            date_str=data.date,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    # ------------------------------------
    # Step 2: Risk Classification
    # ------------------------------------
    # Normalized risk score (0-1 approx)
    # Using a simple heuristic combining Heat Index and Hospitalization Load for now
    # In production, this would be a calibrated probability

    risk_status = "Green"
    risk_desc = "Low Risk - Routine Monitoring"

    # Thresholds (Example logic - should be calibrated)
    # HI > 45 OR Load > 10 => Red
    if heat_index > 45 or pred_load > 100:
        risk_status = "Red"
        risk_desc = "CRITICAL Risk - Immediate Intervention Required"
        query_context = (
            f"critical heatwave protocols severe heat stroke hospitalization"
        )
    elif heat_index > 40 or pred_load > 50:
        risk_status = "Amber"
        risk_desc = "Moderate Risk - Heightened Alert"
        query_context = f"heatwave warning guidelines worker safety hydration"
    else:
        risk_status = "Green"
        risk_desc = "Low Risk - Routine Monitoring"
        query_context = f"general heat preparedness public awareness"

    # ------------------------------------
    # Step 3: Prescriptive RAG
    # ------------------------------------
    # Query ChromaDB for relevant protocols
    relevant_docs = prescriptive_engine.query_protocols(
        query_text=query_context, n_results=2
    )

    # Generate Advice
    advice = await prescriptive_engine.generate_prescriptive_advice(
        risk_level=risk_status,
        district_name=data.district_name,
        heat_index=heat_index,
        context_docs=relevant_docs,
    )

    # ------------------------------------
    # Step 4: Construct Response
    # ------------------------------------
    return AnalysisResponse(
        predicted_hospitalization_load=pred_load,
        heat_index=heat_index,
        lst=data.lst,
        risk_status=risk_status,
        risk_level_description=risk_desc,
        prescriptive_advice=advice,
        source_documents=relevant_docs,
        district_name=data.district_name,
        analysis_date=datetime.now().strftime("%Y-%m-%d"),
        model_version="v1.0",
    )


@router.post("/chat")
async def chat_rag_endpoint(request: ChatRequest, _: dict = Depends(require_auth)):
    """
    PURPOSE: General QA Chat endpoint.
    Retrieves context from ChromaDB and answers using LLM (if available).
    """
    response_data = await prescriptive_engine.chat_rag(
        request.query, district_context=request.district_context
    )
    # response_data is already a dict {answer, context, reasoning}
    return response_data


@router.post("/seed_data")
async def seed_knowledge_base(_: dict = Depends(require_auth)):
    """
    PURPOSE: Helper to seed ChromaDB with some initial dummy data
    if the user doesn't have PDFs to upload yet.
    """
    dummy_docs = [
        {
            "content": "For Critical Heat Waves (Level 3): Immediate activation of cooling centers in all residential zones is mandatory. Mobile water tankers must be deployed every 4 hours.",
            "meta": {"source": "National_HAP_2024.pdf", "page": 12},
        },
        {
            "content": "Workplace Safety Guidelines: Outdoor manual labor is prohibited between 12:00 PM and 3:00 PM when Heat Index exceeds 42°C. Employers must provide ORS solution.",
            "meta": {"source": "Labor_Ministry_Advisory.pdf", "page": 5},
        },
        {
            "content": "Medical Preparedness: Hospitals must maintain dedicated heatstroke wards with ice packs and IV fluids during Amber and Red alert phases.",
            "meta": {"source": "Hospital_Guidelines_v2.pdf", "page": 8},
        },
    ]

    count = 0
    for doc in dummy_docs:
        success = prescriptive_engine.add_document(
            content=doc["content"], metadata=doc["meta"], doc_id=str(uuid.uuid4())
        )
        if success:
            count += 1

    return {"message": f"Seeded {count} dummy documents into ChromaDB."}


@router.get("/districts/rankings")
async def get_district_rankings(_: dict = Depends(require_auth)):
    """
    PURPOSE: Fetch district rankings - simplified version without caching.
    Always fetches fresh data from database or computes if missing.
    """

    async def event_generator():
        start_time = time.time()
        all_batch_results = []
        processed_count = 0

        try:
            today_str = datetime.now().strftime("%Y-%m-%d")

            # Get existing data from database
            existing_results = db_manager.get_results_for_date(today_str)
            all_districts = data_fetcher.get_all_districts()

            if not all_districts:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No districts found'})}\n\n"
                return

            # If we already have data for today (95% or more districts), return it
            if existing_results and len(existing_results) >= len(all_districts) * 0.95:
                logger.info(
                    f"Using existing data from database: {len(existing_results)} districts"
                )
                yield f"data: {json.dumps({'type': 'log', 'message': f'Using existing data for {len(existing_results)} districts'})}\n\n"

                nfhs_service.attach_mortality_risk(existing_results)
                existing_results.sort(key=lambda x: x["risk_score"], reverse=True)

                final_response = {
                    "date": today_str,
                    "total_districts": len(existing_results),
                    "rankings": existing_results,
                    "cached": False,
                    "compute_time": 0,
                }
                yield f"data: {json.dumps({'type': 'result', 'data': final_response})}\n\n"
                yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                return

            # Need to compute fresh data
            districts_to_analyze = all_districts
            results = []
            total_to_process = len(districts_to_analyze)

            logger.info(f"Computing fresh data for {total_to_process} districts")
            yield f"data: {json.dumps({'type': 'log', 'message': f'Computing fresh data for {total_to_process} districts...'})}\n\n"

            # Process in batches
            batch_size = 50
            for batch_start in range(0, total_to_process, batch_size):
                batch_end = min(batch_start + batch_size, total_to_process)
                batch_districts = districts_to_analyze[batch_start:batch_end]

                percent_complete = int((batch_start / total_to_process) * 100)
                yield f"data: {json.dumps({'type': 'progress', 'completed': batch_start, 'total': total_to_process, 'percent': percent_complete, 'message': f'Processing districts {batch_start}-{batch_end}...'})}\n\n"

                # Fetch weather
                weather_map = await data_fetcher.fetch_weather_batch(
                    batch_districts, today_str
                )

                # Prepare data
                districts_with_data = []
                for district_name in batch_districts:
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

                # Predict
                yield f"data: {json.dumps({'type': 'progress', 'completed': batch_start, 'total': total_to_process, 'percent': percent_complete, 'message': f'Computing risk...'})}\n\n"

                predictions = await predictive_engine.predict_batch(
                    districts_with_data, max_concurrent=30
                )

                # Build results
                batch_results = []
                for i, (pred_load, heat_index) in enumerate(predictions):
                    data = districts_with_data[i]
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
                    batch_results.append(result_item)

                all_batch_results.extend(batch_results)
                processed_count += len(batch_results)

                # If this is the first batch and we have high-risk districts, send priority results
                if batch_start == 0 and batch_results:
                    high_risk = [
                        r for r in batch_results if r["risk_status"] in ["Red", "Amber"]
                    ]
                    if high_risk:
                        yield f"data: {json.dumps({'type': 'priority', 'data': high_risk[:10], 'message': f'Found {len(high_risk)} high-risk districts'})}\n\n"

            # Bulk save all results in single transaction
            if all_batch_results:
                yield f"data: {json.dumps({'type': 'progress', 'completed': processed_count, 'total': total_to_process, 'percent': 95, 'message': 'Saving results to database...'})}\n\n"
                db_manager.save_results_bulk(all_batch_results)
                results.extend(all_batch_results)

            # Attach mortality risk and sort
            nfhs_service.attach_mortality_risk(results)
            results.sort(key=lambda x: x["risk_score"], reverse=True)

            compute_time = time.time() - start_time
            logger.info(
                f"Rankings computed in {compute_time:.2f}s for {len(results)} districts"
            )

            coord_hits = sum(
                1
                for r in results
                if r.get("lat") is not None and r.get("lon") is not None
            )

            final_response = {
                "date": today_str,
                "total_districts": len(results),
                "coord_hits": coord_hits,
                "rankings": results,
                "cached": False,
                "compute_time": round(compute_time, 2),
            }

            yield f"data: {json.dumps({'type': 'result', 'data': final_response})}\n\n"
            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            logger.error(f"Failed to generate rankings: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/mortality-risk", response_model=MortalityRiskResponse)
async def get_mortality_risk():
    """
    PURPOSE: Combine HeatGuard heat risk with NFHS disease indicators for mortality risk.
    """
    try:
        # Fetch from database
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT d1.district_name, d1.risk_score, d1.date FROM daily_analysis d1 INNER JOIN (SELECT district_name, MAX(date) AS max_date FROM daily_analysis GROUP BY district_name) d2 ON d1.district_name = d2.district_name AND d1.date = d2.max_date"
        )
        rows = cursor.fetchall()
        conn.close()

        latest_date = None
        items = []
        for district_name, risk_score, date_str in rows:
            # Convert date to string for PostgreSQL compatibility
            if hasattr(date_str, "strftime"):
                date_str = date_str.strftime("%Y-%m-%d")
            if date_str and (latest_date is None or date_str > latest_date):
                latest_date = date_str
            mortality = nfhs_service.get_mortality_risk(str(district_name), risk_score)
            if not mortality:
                continue
            items.append(
                MortalityRiskItem(
                    district_name=str(district_name),
                    heat_risk_score=float(risk_score),
                    heat_risk_date=date_str,
                    mortality_risk_score=mortality["mortality_risk_score"],
                    mortality_disease_index=mortality["mortality_disease_index"],
                    mortality_risk_reason=mortality.get("mortality_risk_reason"),
                )
            )

        items.sort(key=lambda x: x.mortality_risk_score, reverse=True)
        response = MortalityRiskResponse(
            total_districts=len(items), as_of_date=latest_date, items=items
        )

        return response
    except Exception as e:
        logger.error(f"Failed to compute mortality risk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def fetch_historical_weather(
    district_name: str, date_str: str
) -> Optional[Dict[str, float]]:
    """Fetch historical weather data from Open-Meteo for a specific date."""
    try:
        coords = _get_district_coords(district_name)
        if not coords:
            # Fallback to central India coordinates
            coords = {"lat": 23.0, "lon": 78.0}

        # Use Open-Meteo Historical API
        url = "https://archive-api.open-meteo.com/v1/archive"

        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "start_date": date_str,
            "end_date": date_str,
            "daily": "temperature_2m_max,relative_humidity_2m_mean",
            "timezone": "auto",
        }

        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()

        daily = data.get("daily", {})
        max_temp_list = daily.get("temperature_2m_max", [])
        humidity_list = daily.get("relative_humidity_2m_mean", [])

        if not max_temp_list or not humidity_list:
            return None

        max_temp = max_temp_list[0]
        humidity = humidity_list[0]

        # LST approximation: Max Temp + 2 degrees
        lst = max_temp + 2.0 if max_temp else None

        return {
            "max_temp": max_temp,
            "humidity": humidity,
            "lst": lst,
            "date": date_str,
        }
    except Exception as e:
        logger.error(
            f"Error fetching historical weather for {district_name} on {date_str}: {e}"
        )
        return None


@router.get("/districts/{district_name}/history", response_model=list[dict])
async def get_district_history(
    district_name: str, limit: int = 7, _: dict = Depends(require_auth)
):
    """
    Get historical trend data for a specific district.
    Fetches real historical weather from Open-Meteo if database data is insufficient.
    """
    try:
        # Get existing data from database
        history = db_manager.get_district_history(district_name, days=limit)

        # If we have enough data, return it
        if history and len(history) >= 7:
            return history

        # Need to fetch historical data from Open-Meteo
        logger.info(f"Fetching historical weather for {district_name} from Open-Meteo")

        # Get census data for the district
        census_data = data_fetcher.get_district_census(district_name)
        if not census_data:
            logger.warning(f"No census data for {district_name}, using defaults")
            census_data = {
                "pct_children": 0.13,
                "pct_outdoor_workers": 0.15,
                "pct_vulnerable_social": 0.20,
            }

        # Determine which dates we need
        existing_dates = set()
        if history:
            existing_dates = {h.get("date") for h in history if h.get("date")}

        # Build 7-day history ending today
        today = datetime.now()
        target_dates = []
        for i in range(6, -1, -1):
            date_obj = today - timedelta(days=i)
            date_str = date_obj.strftime("%Y-%m-%d")
            if date_str not in existing_dates:
                target_dates.append(date_str)

        # Fetch historical weather for missing dates
        new_entries = []
        for date_str in target_dates:
            weather = await fetch_historical_weather(district_name, date_str)
            if weather:
                # Compute risk using predictive engine
                try:
                    pred_load, heat_index = predictive_engine.predict(
                        district_name=district_name,
                        max_temp=weather["max_temp"],
                        lst=weather["lst"],
                        humidity=weather["humidity"],
                        pct_children=census_data.get("pct_children", 0.13),
                        pct_outdoor_workers=census_data.get(
                            "pct_outdoor_workers", 0.15
                        ),
                        pct_vulnerable_social=census_data.get(
                            "pct_vulnerable_social", 0.20
                        ),
                        date_str=date_str,
                    )

                    entry = {
                        "district_name": district_name,
                        "date": date_str,
                        "max_temp": weather["max_temp"],
                        "humidity": weather["humidity"],
                        "lst": weather["lst"],
                        "risk_score": float(pred_load),
                        "heat_index": float(heat_index),
                        "pct_children": census_data.get("pct_children", 0.13),
                        "pct_outdoor_workers": census_data.get(
                            "pct_outdoor_workers", 0.15
                        ),
                        "pct_vulnerable_social": census_data.get(
                            "pct_vulnerable_social", 0.20
                        ),
                    }
                    new_entries.append(entry)
                except Exception as e:
                    logger.error(
                        f"Error computing risk for {district_name} on {date_str}: {e}"
                    )

        # Combine existing and new data
        all_history = list(history or []) + new_entries

        # Sort by date
        all_history.sort(key=lambda x: x.get("date", ""))

        # Save new entries to database for future use
        if new_entries:
            try:
                db_manager.save_results_bulk(new_entries)
                logger.info(
                    f"Saved {len(new_entries)} historical entries for {district_name}"
                )
            except Exception as e:
                logger.warning(f"Failed to save historical entries: {e}")

        return all_history

    except Exception as e:
        logger.error(f"Error fetching district history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
