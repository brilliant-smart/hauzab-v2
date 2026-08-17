# Hauzab v2 — Deployment Runbook

This is a **readiness** runbook: it gets a fresh server to a working install and
documents the smoke tests and rollback path. The actual switch off the existing
Windows/XAMPP box is driven by hand — nothing here touches a live store until
you point traffic at the new server.

Hauzab v2 is a Laravel 13 (PHP 8.4) API serving a React/TypeScript SPA. The
frontend builds to static assets that live under `backend/public/`, so Laravel
serves both the API (`/api/*` via PHP-FPM) and the SPA shell (everything else,
via the `web.php` catch-all that returns `index.html`). One nginx server block
covers both — no separate SPA host is needed.

The install supports a two-tier topology:

- **Campus box** — the on-site store server. Holds the working database, runs
  the POS, and pushes completed sales up to the cloud.
- **Cloud box** — an off-site mirror that only receives and verifies pushed
  sales (a backup-of-record plus remote reporting). It has its own database.

Both run the same code; the difference is two environment variables
(`SYNC_CLOUD_URL` / `SYNC_SECRET`) documented below.

---

## 1. Prerequisites

On the target server (Ubuntu 22.04+ or Debian 12+):

- **PHP 8.4** with fpm, mysql, mbstring, xml, bcmath, gd, zip, curl.
- **Composer 2**.
- **Node 24** (only needed at build time; not required at runtime).
- **MySQL 8** or **MariaDB 10.6+**.
- **nginx** + **PHP-FPM** (the `php8.4-fpm` service).
- **rsync** (used by `deploy/build.sh`).
- Optional: **supervisor** (only if you switch away from `QUEUE_CONNECTION=sync`).

Create the install directory and a release user (here `www-data` is assumed):

```
sudo mkdir -p /var/www/hauzab
sudo chown -R $USER:www-data /var/www/hauzab
```

---

## 2. Get the code and configure the environment

```
cd /var/www/hauzab
git clone <repo-url> .
```

Copy the example env and fill in real values:

```
cp backend/.env.example backend/.env
cd backend
php artisan key:generate
```

Edit `backend/.env` for production. The `.env.example` ships a commented
`# --- production ---` block with the overrides that matter:

```
APP_ENV=production
APP_DEBUG=false
APP_KEY=                      # leave the value key:generate just wrote
APP_URL=https://hauzab.example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=hauzab_v2
DB_USERNAME=hauzab
DB_PASSWORD=<real password>

CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync
```

Create the database and user:

```
mysql -u root -p -e "CREATE DATABASE hauzab_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'hauzab'@'localhost' IDENTIFIED BY '<password>'; GRANT ALL ON hauzab_v2.* TO 'hauzab'@'localhost'; FLUSH PRIVILEGES;"
```

### Sync settings (campus vs cloud)

The two tiers are selected purely by env vars — no code change.

**Campus box** (pushes sales up):

```
SYNC_CLOUD_URL=https://cloud.example.com/api/sync
SYNC_SECRET=<shared secret — same string on both boxes>
```

**Cloud box** (receives only): leave `SYNC_CLOUD_URL` empty so the campus
pusher is never invoked, and set the same `SYNC_SECRET` so incoming pushes
pass `VerifySyncSecret`:

```
SYNC_CLOUD_URL=
SYNC_SECRET=<same shared secret>
```

The scheduler on the campus box runs `sync:push` every minute; on the cloud box
that command is a no-op (nothing to push) and the box only answers inbound
`/api/sync` requests.

---

## 3. Build and install

From the repo root:

```
bash deploy/build.sh
```

`build.sh` is idempotent and safe to re-run on every deploy. It:

1. Builds the frontend (`npm ci && npm run build`) and mirrors `dist/` into
   `backend/public/` with `rsync --delete` (stale hashed assets from a previous
   build are removed).
2. Installs production-only PHP dependencies and optimizes the autoloader.
3. Caches config, routes, and views.
4. Runs pending migrations (`migrate --force`).

> **Note:** `build.sh` does **not** run `migrate:legacy`. That is a one-time
> import of the old store data and is run by hand below.

---

## 4. Migrate the database and import legacy data

### Fresh schema

`build.sh` already ran `php artisan migrate`. Confirm the schema is in place:

```
php artisan migrate:status
```

### One-time legacy import

The legacy data lives in the old XAMPP MySQL databases (`hauzab_db` for the
supermarket, `pharmacy` for the pharmacy). Importing them is a one-time step
done from the **campus box** (where the legacy dumps are available):

1. Load the two legacy dumps into MySQL on the new server (or restore them on
   the old box and point the importer at it). The importer expects the legacy
   tables to be reachable from the same MySQL instance, under the names
   `hauzab_db` and `pharmacy`.

2. Run the importer fresh — it drops the v2 rows it owns and reimports
   losslessly into tenants 1 (supermarket) and 2 (pharmacy):

   ```
   php artisan migrate:legacy --fresh
   ```

   `--fresh` truncates the v2 tenant data and reimports from scratch. Omit it
   for an incremental import. Either way the importer is idempotent on order
   ids (stray duplicate ids are suffixed with `-<row_id>`; the primary row keeps
   the clean number).

> The full `migrate:legacy` run needs the real `legacy_*` MySQL databases, so it
> is not part of the automated test suite. It was verified end-to-end against
> the real legacy data (both tenants import and reconcile) and is re-verified
> manually at cutover. See the `@group legacy` note in the test suite.

---

## 5. Web server, scheduler, and backups

### nginx

Install the site config and reload:

```
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hauzab
sudo ln -s /etc/nginx/sites-available/hauzab /etc/nginx/sites-enabled/hauzab
sudo nginx -t && sudo systemctl reload nginx
```

`deploy/nginx.conf` roots the site at `backend/public`, serves `/assets/*`
directly with a one-year immutable cache, and falls everything else through to
`/index.php?$query_string` so SPA client routes (`/dashboard`, `/pos`, …) are
served by Laravel's `web.php` catch-all. Adjust `server_name` and the PHP-FPM
socket path to match the server.

### Scheduler

Install the crontab for the web user:

```
sudo crontab -u www-data deploy/crontab
```

One system cron entry drives every scheduled task (the `sync:push` minute loop
and the daily `product-cards:seed-today`). The same file schedules the daily
backup at 02:00. Adjust the paths and the `php8.4` binary if they differ.

### Backups

`deploy/backup.sh` dumps the live database with `mysqldump --single-transaction`,
gzips it into `backups/`, and prunes copies older than 30 days. It reads DB
credentials from `backend/.env`, so nothing is hardcoded. The crontab above
runs it daily; to run it by hand:

```
bash deploy/backup.sh
```

Restore a backup with:

```
gunzip -c /var/www/hauzab/backups/hauzab_v2_2026-08-15.sql.gz | \
  mysql -h "$DB_HOST" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE"
```

### Queue worker (optional)

The app ships with `QUEUE_CONNECTION=sync`, so all background work runs inline
on the scheduler and **no queue worker is required**. `deploy/supervisor.conf`
is included for installs that later switch to a real queue driver (redis, etc.)
for heavier jobs. To enable it then:

```
sudo cp deploy/supervisor.conf /etc/supervisor/conf.d/hauzab.conf
sudo supervisorctl reread && sudo supervisorctl update
```

---

## 6. Smoke tests

From the server, against `APP_URL` (or `http://127.0.0.1:8000` if you are
running `php artisan serve` during a dry run):

### Get a token

```
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@store.test","password":"secret123"}' | jq -r .token)
```

### The eight core endpoints

```
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/dashboard/summary
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/products
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/products/low-stock
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/products/expiring
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/orders
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/reports/sales?from=2026-08-01&to=2026-08-14
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/reports/staff-sales
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/consignments
```

Each should return `200` with valid JSON (lists or the dashboard summary). A
`401` means the token is bad; a `500` means check `storage/logs/laravel.log`.

### XLSX export

```
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/reports/sales-audit/export?from=2026-08-01&to=2026-08-14 \
  -o audit.xlsx -D -
```

Confirm the response carries
`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
and `Content-Disposition: attachment; filename=...xlsx`, and that `audit.xlsx`
is a non-empty spreadsheet.

### Account, import, and admin endpoints

```
# Password recovery (public) — same generic reply for known and unknown emails
curl -s -X POST http://127.0.0.1:8000/api/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"admin@store.test"}'

# Profile + password change (auth:sanctum)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/auth/profile
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  http://127.0.0.1:8000/api/auth/change-password \
  -d '{"current_password":"secret123","new_password":"newsecret123"}'

# Bulk product import + blank template (admin|supervisor)
curl -s -H "Authorization: Bearer $TOKEN" \
  -F "file=@products.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  http://127.0.0.1:8000/api/products/import
# expect {"imported":N,"updated":N,"skipped":N,"errors":[...]}
curl -s -o template.xlsx -D - -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/products/import/template

# Customers (any signed-in staff) and devices + branches (admin|supervisor)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/customers
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/devices
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/branches
```

The import returns a `{imported, updated, skipped, errors}` summary; `errors`
lists per-row failures (a row with a bad date or non-numeric quantity is
skipped, not aborting the batch). Each product line also writes a consignment
row and opens the day's stock card, so a re-import of the same barcode adds to
the existing stock rather than duplicating it.

### SPA shell

```
curl -s http://127.0.0.1:8000/dashboard | grep -q '<div id="root">' && echo "SPA shell OK"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/assets/index-*.js
```

The first should find the SPA root div; the second should be `200` for a hashed
asset (serve that via the browser to load the app).

### Sync secret (cloud box)

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8000/api/sync \
  -H "X-Sync-Secret: wrong" -H 'Content-Type: application/json' -d '{}'
# expect 403

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8000/api/sync \
  -H "X-Sync-Secret: $SYNC_SECRET" -H 'Content-Type: application/json' -d '{}'
# expect 422 (payload invalid, but secret accepted) — 500 means SYNC_SECRET is unset
```

---

## 7. Rollback

Because `build.sh` is idempotent and migrations are forward-only, rollback is a
database restore plus a redeploy of the previous code:

1. **Stop traffic** to the app (nginx) or take the campus box offline at the
   load balancer / DNS.
2. **Restore the database** from the most recent good backup (see the restore
   command in §5 Backups). If a migration ran that you need to undo, restore to
   the backup taken just before the deploy.
3. **Revert the code** to the last known-good commit:
   ```
   cd /var/www/hauzab
   git log --oneline -5          # find the good commit
   git checkout <good-sha>
   bash deploy/build.sh
   ```
   `build.sh` re-runs migrations (forward-only) and rebuilds assets.
4. Re-enable traffic and re-run the §6 smoke tests.

For a quick code-only rollback (no DB change), steps 1, 3, and 4 are enough —
skip the restore unless a migration actually ran.

---

## 8. Post-deploy checklist

- [ ] `php artisan migrate:status` — all migrations ran.
- [ ] `php artisan config:cache` / `route:cache` / `view:cache` ran in `build.sh`.
- [ ] nginx `-t` passes; site loads over HTTPS.
- [ ] Scheduler installed (`crontab -u www-data -l` shows the schedule:run line).
- [ ] First nightly backup produced a `.sql.gz` in `backups/`.
- [ ] Eight core endpoints + XLSX export return 200.
- [ ] SPA shell loads; a hashed asset returns 200.
- [ ] Campus: `SYNC_CLOUD_URL` + `SYNC_SECRET` set; `sync:push` runs on the
      minute. Cloud: `SYNC_CLOUD_URL` empty, `SYNC_SECRET` set, inbound sync
      returns 403/422 as above.