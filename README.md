# Hauzab v2

Multi-tenant, offline-first inventory + POS system. Rewrite of the existing Hauzab
(Laravel 9 / Blade / jQuery) app using the stack from [BrilliantPOS](https://github.com/brilliant-smart/BrilliantPOS).

> The old system lives in `../hauzab/` and is kept as the **reference for the exact
> screens/flows** to replicate (staff must not be retrained). The BrilliantPOS repo is
> cloned in `../_reference/BrilliantPOS/` and is the **stack template**.
> Full plan: `../hauzab-v2-plan.docx` (sections A–G).

## Stack
- **Backend:** Laravel 13, PHP 8.4, API-only, Sanctum token auth + custom AuthController.
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + react-hook-form/zod + sonner.
- **Cashier client:** browser-only on the LAN (no Electron).
- **Database:** MariaDB, single shared DB, multi-tenant via `tenant_id` + `branch_id` + `device_id` + global scopes.

## Topology
One **campus local server** (Laravel + MariaDB, in the supermarket) serves all buildings
over the LAN — offline-first (works with no internet). A **cloud VPS (Upperlink)** is the
online hub: consolidated audit/reports, remote access, and the sync target.

- `tenant` = a business (Supermarket, Pharmacy, Bakery, …)
- `branch` = a building/location
- `device` = a till/tablet

Sync: outbox pattern with UUID idempotency keys; sales append-only; master data
cloud-authoritative; audit on the cloud.

## Phases
0. Foundation — monorepo scaffold, Sanctum auth + roles, multi-tenant foundation, VPS deploy pipeline
1. Catalog & users (products, categories, suppliers, manufacturers, units, users/roles)
2. POS, offline-first (cart, checkout, receipts 58mm + 80mm + A4, payments)
3. Sync engine (outbox ↔ cloud, master-data pull, online audit/reports)
4. Expenses, reports, audit, low-stock, expiry, daily_logs + data migration from `hauzab_db` & `pharmacy`
5. Polish, facelift, testing, deploy, staff cutover

## Layout (to be created in Phase 0)
```
backend/    Laravel 13 API + SPA host
frontend/   React + Vite + TS + Tailwind + shadcn
```

## Notes
- Previous developer's git history was not available; files were taken from the store's
  server computer. This repo starts fresh.
- Single brand identity across all businesses (no per-tenant theming).
- Automated daily DB backups on both campus server and VPS.