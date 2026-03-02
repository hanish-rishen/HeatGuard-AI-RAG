# Deployment Guide

This guide covers how to deploy HeatGuard AI both locally and on Leapcell.

## Local Development

### Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env - set PORT=8000 for local development

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# For local development, no env file needed
# The frontend will auto-detect localhost:8000

# Start dev server
npm run dev
```

### Local URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- API Docs: http://localhost:8000/docs

---

## Leapcell Deployment

### Backend Deployment

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Configure Leapcell**
   - Connect your GitHub repo to Leapcell
   - Set build command: `cd backend && pip install -r requirements.txt`
   - Set start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8080`

3. **Environment Variables** (in Leapcell dashboard)
   ```
   PORT=8080
   HOST=0.0.0.0
   DEBUG=false
   CORS_ORIGINS=https://your-frontend-domain.com
   JWT_SECRET_KEY=your-random-secret-key-here
   AUTH_ADMIN_USERNAME=admin
   AUTH_ADMIN_PASSWORD=your-secure-password
   ```

### Frontend Deployment

1. **Create production build**
   ```bash
   cd frontend
   
   # Create env file for production
   echo "VITE_API_BASE_URL=https://your-leapcell-backend.com/api" > .env.production
   
   # Build
   npm run build
   ```

2. **Deploy to static hosting** (Vercel, Netlify, etc.)
   - Upload the `dist/` folder
   - Or connect your GitHub repo for auto-deploy

---

## Environment Variables Reference

### Backend (.env)

| Variable | Local | Leapcell | Description |
|----------|-------|----------|-------------|
| PORT | 8000 | 8080 | Server port |
| HOST | 0.0.0.0 | 0.0.0.0 | Bind address |
| DEBUG | true | false | Debug mode |
| CORS_ORIGINS | (empty) | https://... | Allowed frontend origins |
| JWT_SECRET_KEY | any string | random secure | JWT signing key |
| AUTH_ADMIN_PASSWORD | admin123 | secure password | Admin password |

### Frontend (.env / .env.production)

| Variable | Local | Production | Description |
|----------|-------|------------|-------------|
| VITE_API_BASE_URL | (auto) | https://... | Backend API URL |

**Note:** If `VITE_API_BASE_URL` is not set, the frontend will:
1. Use the env var if set
2. Auto-detect if on deployed domain (same origin)
3. Fall back to `http://localhost:8000/api`

---

## Troubleshooting

### CORS Errors
If you see CORS errors in the browser:
1. Check that `CORS_ORIGINS` includes your frontend URL
2. For local development, leave `CORS_ORIGINS` empty

### Database Errors
The database automatically initializes on first use:
- **Local**: `backend/district_analytics.db`
- **Leapcell**: `/tmp/district_analytics.db`

### Authentication Issues
If login fails:
1. Check that `JWT_SECRET_KEY` matches between sessions
2. Verify `AUTH_ADMIN_PASSWORD` is set correctly
3. Clear browser localStorage and try again
