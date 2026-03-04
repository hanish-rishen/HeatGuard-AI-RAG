# HeatGuard AI — Presentation Day Setup Guide

**⚡ Copy-paste ready. No thinking required.**

---

## Quick Start (5 Minutes)

### 1. Backend Setup

```bash
cd R:\HeatGuard AI - Copy\backend

# Activate virtual environment
.\venv\Scripts\activate

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Verify:** Open `http://localhost:8000/docs` — should see FastAPI Swagger UI.

---

### 2. Frontend Setup

**New terminal window:**

```bash
cd R:\HeatGuard AI - Copy\frontend

# Install deps (if not done)
npm install

# Start dev server
npm run dev
```

---

### 3. Open the App

**URL:** `http://localhost:5173`

**Login:**
- Username: `admin`
- Password: `admin123`

---

## What Was Fixed

### Issue 1: Dashboard Used Hardcoded `localhost`
**Problem:** Dashboard component was calling `http://localhost` directly, breaking when backend is elsewhere.  
**Fix:** Updated to use `API_BASE_URL` from `api.ts` for all API calls.

### Issue 2: Cold Start / Weather API Failures
**Problem:** Backend failed on first request due to slow model loading and weather API timeouts.  
**Fix:** Added warmup script, retry logic with exponential backoff, and startup model preloading.

### Issue 3: Redis Cache + Synthetic Data Causing Confusion
**Problem:** Redis caching and fake synthetic history data made it hard to tell what was real.  
**Fix:** Removed Redis cache and synthetic data generation. Now shows real data only.

---

## If Something Goes Wrong

### Backend won't start
```bash
# Check port 8000 is free
netstat -ano | findstr :8000

# Kill process if needed
taskkill /PID <PID> /F

# Or use different port
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend can't connect to backend
1. Check backend is running: `http://localhost:8000/health`
2. Verify no `.env` file in frontend is overriding the URL
3. Check browser console for CORS errors

### "Module not found" errors
```bash
# Reinstall frontend deps
rm -rf node_modules
npm install

# Reinstall backend deps
pip install -r requirements.txt
```

### ChromaDB / model loading errors
```bash
# Check model files exist
dir "R:\HeatGuard AI - Copy\Models\"

# Should see: heat_health_model_v1.pkl, district_encoder.pkl
```

---

## Switching Back to Deployed Mode (Future)

To go back to Leapcell production deployment:

### Frontend
No changes needed — auto-detects production domain.

Or explicitly set in `frontend/.env`:
```env
VITE_API_BASE_URL=https://your-leapcell-app.leapcell.dev/api
```

### Backend
Update `backend/.env`:
```env
PORT=8080
CORS_ORIGINS=https://your-frontend-domain.com
DEBUG=false
```

Then deploy to Leapcell as usual.

---

## Emergency Contacts (File Locations)

| File | Purpose |
|------|---------|
| `frontend/api.ts:141-159` | API URL logic |
| `backend/.env` | Backend config |
| `backend/app/main.py` | Server entry point |
| `frontend/src/Dashboard.tsx` | Main dashboard |

---

**Good luck! 🚀**
