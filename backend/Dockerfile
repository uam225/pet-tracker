FROM python:3.12-slim

WORKDIR /app

# Install curl for the healthcheck in production compose
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies before copying source.
# This layer is cached and only rebuilds when requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source and alembic migration directory
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Ensure the data mount point exists inside the container.
# In production this is mounted from the persistent disk.
RUN mkdir -p /data

# Run as a non-root user for security
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
