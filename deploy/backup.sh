#!/usr/bin/env bash
#
# Hauzab v2 — daily MySQL backup. Dumps the live database, gzips it, and prunes
# copies older than 30 days. Reads DB credentials from backend/.env so nothing
# is hardcoded. Run via the crontab entry in deploy/crontab (02:00 daily) or by
# hand: `bash deploy/backup.sh`.
#
# Restore a backup with:
#   gunzip -c /var/www/hauzab/backups/hauzab_v2_2026-08-15.sql.gz | \
#     mysql -h "$DB_HOST" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE"
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — nothing to back up." >&2
  exit 1
fi

# Pull the connection settings out of .env without sourcing it.
DB_DATABASE="$(grep -E '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2-)"
DB_HOST="$(grep -E '^DB_HOST=' "$ENV_FILE" | cut -d= -f2-)"
DB_PORT="$(grep -E '^DB_PORT=' "$ENV_FILE" | cut -d= -f2-)"
DB_USERNAME="$(grep -E '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2-)"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%F)"
DEST="$BACKUP_DIR/${DB_DATABASE}_${STAMP}.sql.gz"

mysqldump \
  --host="${DB_HOST:-127.0.0.1}" \
  --port="${DB_PORT:-3306}" \
  --user="$DB_USERNAME" \
  --password="$DB_PASSWORD" \
  --single-transaction --quick --routines \
  "$DB_DATABASE" | gzip > "$DEST"

# Keep the last 30 days; older backups are removed.
find "$BACKUP_DIR" -name "${DB_DATABASE}_*.sql.gz" -type f -mtime +30 -delete

echo "Backed up $DB_DATABASE to $DEST ($(du -h "$DEST" | cut -f1))."