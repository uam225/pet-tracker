#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# backup.sh — SQLite database backup to GCP Cloud Storage
#
# Usage:
#   ./scripts/backup.sh
#
# Required environment variables (set in .env or export before running):
#   GCP_BUCKET   — GCS bucket path, e.g. gs://my-pet-tracker-backups
#
# Intended to run daily via cron on the GCP Compute Engine instance:
#   0 2 * * * /home/ubuntu/pet-tracker/scripts/backup.sh >> /var/log/backup.log 2>&1
#
# Prerequisites on the host:
#   - gcloud CLI authenticated (gcloud auth login or a service account key)
#   - sqlite3 installed (sudo apt-get install sqlite3)
# ---------------------------------------------------------------------------

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_PATH="${DATABASE_PATH:-/data/pettracker.db}"
GCP_BUCKET="${GCP_BUCKET:-}"
BACKUP_DIR="/tmp/pettracker-backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/pettracker_${TIMESTAMP}.db"
KEEP_DAYS=30

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

if [[ -z "${GCP_BUCKET}" ]]; then
  echo "[ERROR] GCP_BUCKET environment variable is not set." >&2
  exit 1
fi

if [[ ! -f "${DB_PATH}" ]]; then
  echo "[ERROR] Database not found at ${DB_PATH}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

mkdir -p "${BACKUP_DIR}"

echo "[INFO] ${TIMESTAMP} — Starting backup of ${DB_PATH}"

# Use SQLite's '.backup' command for a hot, consistent backup.
# This is safe even while the application is writing (WAL mode ensures
# consistency without locking out the application).
sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

# Compress the backup
gzip "${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Upload to GCS
gsutil -q cp "${BACKUP_FILE}" "${GCP_BUCKET}/daily/${TIMESTAMP}.db.gz"

echo "[INFO] Uploaded to ${GCP_BUCKET}/daily/${TIMESTAMP}.db.gz"

# Keep a 'latest' pointer for easy restore
gsutil -q cp "${BACKUP_FILE}" "${GCP_BUCKET}/latest.db.gz"

# ---------------------------------------------------------------------------
# Retention: remove local temp files and remote backups older than KEEP_DAYS
# ---------------------------------------------------------------------------

rm -f "${BACKUP_FILE}"

# Remove old backups from GCS (best-effort; non-fatal on error)
CUTOFF="$(date -u -d "${KEEP_DAYS} days ago" +%Y%m%d 2>/dev/null || date -u -v-${KEEP_DAYS}d +%Y%m%d)"
gsutil -q ls "${GCP_BUCKET}/daily/" | while read -r obj; do
  OBJ_DATE="$(basename "${obj}" | cut -c1-8)"
  if [[ "${OBJ_DATE}" < "${CUTOFF}" ]]; then
    gsutil -q rm "${obj}" && echo "[INFO] Removed old backup: ${obj}"
  fi
done || true

echo "[INFO] Backup complete."
