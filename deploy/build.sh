#!/usr/bin/env bash
#
# Hauzab v2 — production build. Builds the frontend, mirrors the Vite output
# into backend/public/ (so Laravel serves the SPA shell and hashed assets),
# then installs production-only PHP deps, caches the config/routes/views, and
# runs pending migrations. Idempotent — safe to re-run on every deploy.
#
# First-time only: after the initial build, import the legacy data with
# `php artisan migrate:legacy` (see DEPLOY.md). That step is NOT run here.
#
# Prerequisites on the server: PHP 8.4, Composer, Node 24, rsync.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Frontend"
cd "$APP_DIR/frontend"
npm ci
npm run build
# --delete mirrors dist/ into backend/public/ so stale hashed assets from a
# previous build are removed, but Laravel's own front-controller files (which
# live in the same public dir) are preserved.
rsync -a --delete \
  --exclude='index.php' \
  --exclude='.htaccess' \
  --exclude='robots.txt' \
  --exclude='storage' \
  dist/ "$APP_DIR/backend/public/"

echo "==> Backend"
cd "$APP_DIR/backend"
composer install --no-dev --optimize-autoloader

php artisan config:cache
php artisan route:cache
php artisan view:cache

# Non-interactive migration of any new schema changes.
php artisan migrate --force

echo "==> Done. Reload PHP-FPM (and run `php artisan queue:restart` if a worker is active)."