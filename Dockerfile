FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 1. Copy and install requirements first (for better caching)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# 2. COPY THE MISSING ROOT DIRECTORIES
# These are the files the server was looking for in your logs
COPY data /app/data
COPY Models /app/Models

# 3. Copy the backend code
COPY backend /app/backend

# 4. Set the working directory to the backend for the CMD to run
WORKDIR /app/backend

EXPOSE 8080

# Use the PORT environment variable provided by Render
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
