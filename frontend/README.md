# HeatGuard AI Frontend

React + TypeScript + Vite dashboard for **HeatGuard AI**.

Key UI features include:
- High Priority Alerts (top-at-risk districts)
- 7-day trend chart
- Risk map with district selection and AI recommendations
- PDF export for analysis reports

## Prerequisites

- Node.js (LTS recommended)

## Install

```bash
npm install
```

## Run (dev)

```bash
npm run dev
```

The app will be available at the Vite URL shown in the terminal (typically `http://localhost:5173`).

## Build

```bash
npm run build
```

## Configure API base URL

This frontend calls the FastAPI backend (typically `http://localhost:8080`).

If you need to change the backend URL, check `frontend/api.ts` (and any environment-based configuration your deployment uses).


