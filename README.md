# HeatGuard AI — Predictive + Prescriptive Heat Action Platform

HeatGuard AI is a full-stack application for **district-level heat risk monitoring** and decision support, combining:

- **Predictive modeling** (risk / hospitalization load signals)
- **Prescriptive guidance (RAG)** to generate actionable recommendations from Heat Action Plan (HAP) content
- **Interactive dashboard** (risk map, alerts, trends, PDF export)

## Repo structure

- `backend/` — FastAPI API + services (predictive + prescriptive engines)
- `frontend/` — React + TypeScript + Vite UI
- `Models/` — trained model artifacts (PKL)
- `data/` — datasets + district geocodes

## Quickstart (local dev)

### Backend (FastAPI)

**Prereqs:** Python 3.10+ recommended

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: `http://localhost:8000/docs`

#### Environment

- Copy `backend/.env.example` → `backend/.env` and fill values as needed.
- `backend/.env` is ignored by git.

### Frontend (React)

**Prereqs:** Node.js (LTS recommended)

```bash
cd frontend
npm install
npm run dev
```

UI typically runs at `http://localhost:5173`.

> The frontend expects the backend at `http://localhost:8000/api` by default. See `frontend/api.ts` if you need to change it.

## Key capabilities

- **High Priority Alerts**: top-risk districts with compact percent badge
- **Risk Map**: pan/zoom, pin selection, draggable district card + recommendation modal
- **7-day trend**: stable 7-point series (with backfill when history is short)
- **PDF export**: download dashboard report

## API (common endpoints)

- `GET /api/health` — health check
- `POST /api/analyze` — run analysis + get prescriptive advice
- `GET /api/rankings` — district risk rankings feed
- `GET /api/districts/{district}/history?limit=...` — district trend history
- `POST /api/upload` / `GET /api/files` / `DELETE /api/files/{filename}` — RAG file management

## Notes

- Local artifacts like `backend/chroma_db/`, `backend/*.db`, and Python `__pycache__/` are ignored and not committed.
- If you see a local `district_analytics.db` at repo root, it’s a runtime artifact and should stay untracked.

