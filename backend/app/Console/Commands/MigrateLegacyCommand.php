<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PDO;

/**
 * Lossless import of the legacy Hauzab databases into the multi-tenant v2
 * schema. hauzab_db (supermarket) becomes tenant 1, pharmacy becomes tenant 2.
 *
 * Idempotent: a second run skips rows already imported (matched on legacy_pid /
 * legacy_id / legacy_number within the tenant). Use --fresh to wipe a tenant's
 * imported rows first and re-import from scratch.
 *
 * Large tables (order_details, payments, product_cards) are streamed in chunks
 * with per-chunk transactions; only the small pid→id maps live in memory.
 */
class MigrateLegacyCommand extends Command
{
    protected $signature = 'migrate:legacy
        {--tenant= : Import only one tenant (supermarket or pharmacy)}
        {--fresh : Delete the tenant\'s imported rows before importing}
        {--dry-run : Count and plan only, write nothing}
        {--chunk=2000 : Chunk size for the large tables}';

    protected $description = 'Import the legacy Hauzab databases into v2 (lossless)';

    private const TENANTS = [
        ['conn' => 'legacy_supermarket', 'slug' => 'supermarket', 'name' => 'Hauzab Super Market', 'tenantId' => 1, 'suffix' => 'supermarket'],
        ['conn' => 'legacy_pharmacy', 'slug' => 'pharmacy', 'name' => 'Hauzab Pharmacy', 'tenantId' => 2, 'suffix' => 'pharmacy'],
    ];

    private const UNIT_MAP = [
        'piece' => 'Pieces', 'pieces' => 'Pieces', 'pices' => 'Pieces', 'pisecs' => 'Pieces',
        'pcs' => 'PCS', 'psc' => 'PCS',
        'carton' => 'Carton', 'crete' => 'Carton', 'half crete' => 'Carton',
        'tin' => 'Tin', 'pack' => 'Packs', 'packs' => 'Packs', 'roll' => 'Roll',
    ];

    private array $report = [];

    public function handle(): int
    {
        $selected = $this->option('tenant');
        $tenants = $selected ? array_filter(self::TENANTS, fn ($t) => $t['slug'] === $selected) : self::TENANTS;

        if (empty($tenants)) {
            $this->error("Unknown tenant '{$selected}'. Use supermarket or pharmacy.");
            return self::FAILURE;
        }

        foreach ($tenants as $tenant) {
            $this->processTenant($tenant);
        }

        $this->printReport();

        return self::SUCCESS;
    }

    private function processTenant(array $t): void
    {
        $conn = $t['conn'];
        $tenantId = $t['tenantId'];

        $this->info("=== {$t['name']} (tenant {$tenantId}) ===");

        if (! $this->option('dry-run')) {
            $this->ensureTenant($t);
        }

        if ($this->option('dry-run')) {
            $this->dryRun($conn, $t);
            return;
        }

        if ($this->option('fresh')) {
            $this->freshTenant($tenantId);
        }

        $chunk = (int) $this->option('chunk');

        $userPidMap = $this->importUsers($conn, $tenantId, $t, $chunk);
        $unitMap = $this->deriveUnits($conn, $tenantId);
        $productPidMap = $this->importProducts($conn, $tenantId, $chunk);
        $orderNumberMap = $this->importOrders($conn, $tenantId, $userPidMap, $chunk);
        $this->importOrderDetails($conn, $tenantId, $orderNumberMap, $productPidMap, $chunk);
        $this->importPayments($conn, $tenantId, $orderNumberMap, $userPidMap, $chunk);
        $expenseCatPidMap = $this->importExpenseCategories($conn, $tenantId, $chunk);
        $this->importExpenses($conn, $tenantId, $expenseCatPidMap, $userPidMap, $chunk);
        $this->importDailyLogs($conn, $tenantId, $userPidMap, $chunk);
        $this->importProductCards($conn, $tenantId, $productPidMap, $userPidMap, $chunk);
        $this->importConsignments($conn, $tenantId, $userPidMap, $chunk);
    }

    private function ensureTenant(array $t): void
    {
        $now = now();

        // Create the tenant + a Main branch + a default device if they don't
        // already exist (a fresh, unseeded DB has none of these).
        if (! DB::table('tenants')->where('id', $t['tenantId'])->exists()) {
            DB::table('tenants')->insert([
                'id' => $t['tenantId'],
                'name' => $t['name'],
                'slug' => $t['slug'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $branchId = DB::table('branches')->where('tenant_id', $t['tenantId'])->value('id');
        if (! $branchId) {
            $branchId = DB::table('branches')->insertGetId([
                'tenant_id' => $t['tenantId'],
                'name' => 'Main',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        if (! DB::table('devices')->where('tenant_id', $t['tenantId'])->exists()) {
            DB::table('devices')->insert([
                'tenant_id' => $t['tenantId'],
                'branch_id' => $branchId,
                'name' => 'Main Till',
                'last_seen_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function freshTenant(int $tenantId): void
    {
        $this->info("Wiping imported rows for tenant {$tenantId}…");

        // Delete this tenant's legacy-imported rows in reverse FK order. The
        // seeded tenant/branch/device rows are left in place.
        $legacyUserIds = DB::table('users')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('id');

        // payments and order_items carry no tenant_id — scope them through a
        // join to the tenant's orders (a WHERE IN over 95k ids blows the
        // prepared-statement param limit, so use a JOIN delete instead).
        DB::table('product_consignments')->where('tenant_id', $tenantId)->delete();
        DB::table('product_cards')->where('tenant_id', $tenantId)->delete();
        DB::table('daily_logs')->where('tenant_id', $tenantId)->delete();
        DB::table('expenses')->where('tenant_id', $tenantId)->delete();
        DB::table('expense_categories')->where('tenant_id', $tenantId)->delete();
        DB::statement('DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.tenant_id = ?', [$tenantId]);
        DB::statement('DELETE i FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.tenant_id = ?', [$tenantId]);
        DB::table('orders')->where('tenant_id', $tenantId)->delete();
        DB::table('products')->where('tenant_id', $tenantId)->delete();
        DB::table('product_units')->where('tenant_id', $tenantId)->delete();

        DB::table('user_profiles')->whereIn('user_id', $legacyUserIds)->delete();
        DB::table('users')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->delete();
    }

    // ---------- Users ----------

    private function importUsers(string $conn, int $tenantId, array $t, int $chunk): array
    {
        $existing = DB::table('users')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('legacy_pid')->flip();
        $map = DB::table('users')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('id', 'legacy_pid')->all();
        $migrated = 0;
        $skipped = 0;
        $collisions = 0;

        $total = DB::connection($conn)->table('users')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('users')
            ->leftJoin('user_details', 'user_details.user_pid', '=', 'users.pid')
            ->select('users.*', 'user_details.fullname', 'user_details.qualification', 'user_details.designation', 'user_details.state', 'user_details.gender', 'user_details.address', 'user_details.gsm', 'user_details.account_name', 'user_details.account_number', 'user_details.bank_name', 'user_details.salary')
            ->orderBy('users.id')
            ->chunk($chunk, function ($rows) use ($tenantId, $t, &$existing, &$map, &$migrated, &$skipped, &$collisions) {
                foreach ($rows as $r) {
                    $this->output->progressAdvance();
                    if ($existing->has($r->pid)) {
                        $skipped++;
                        continue;
                    }

                    $email = $r->email;
                    $meta = null;
                    if (DB::table('users')->where('email', $email)->exists()) {
                        // Global email collision (e.g. same owner in both DBs).
                        // Plus-address the second occurrence so it lands in the
                        // same inbox; keep the original in legacy_meta.
                        $meta = ['original_email' => $email];
                        $email = $this->plusAddress($email, $t['suffix']);
                        $collisions++;
                    }

                    // Legacy helper hierarchy (inverted naming): isSupervisor()
                    // is satisfied only by type 1, isManager() by type 1 OR 2,
                    // so type 1 is the most-privileged role and maps to v2 admin.
                    $role = match ((int) $r->type) {
                        1 => 'admin',
                        2 => 'supervisor',
                        default => 'staff',
                    };

                    $now = now();
                    $userId = DB::table('users')->insertGetId([
                        'name' => $r->name,
                        'email' => $email,
                        'password' => $r->password, // already a $2y$ bcrypt hash
                        'role' => $role,
                        'is_active' => ((int) $r->status) === 1,
                        'tenant_id' => $tenantId,
                        'branch_id' => DB::table('branches')->where('tenant_id', $tenantId)->value('id'),
                        'legacy_pid' => $r->pid,
                        'legacy_meta' => $meta ? json_encode($meta) : null,
                        'created_at' => $r->created_at ?? $now,
                        'updated_at' => $r->updated_at ?? $now,
                    ]);

                    DB::table('user_profiles')->insert([
                        'user_id' => $userId,
                        'tenant_id' => $tenantId,
                        'fullname' => $r->fullname ?? $r->name,
                        'gender' => $r->gender,
                        'address' => $r->address,
                        'phone' => $r->gsm,
                        'qualification' => $r->qualification,
                        'designation' => $r->designation,
                        'state' => $r->state,
                        'account_name' => $r->account_name,
                        'account_number' => $r->account_number,
                        'bank_name' => $r->bank_name,
                        'salary' => $r->salary ?? 0,
                        'created_at' => $r->created_at ?? $now,
                        'updated_at' => $r->updated_at ?? $now,
                    ]);

                    $map[$r->pid] = $userId;
                    $existing[$r->pid] = true;
                    $migrated++;
                }
            });

        $this->output->progressFinish();
        if ($collisions > 0) {
            $this->warn("  Email collisions resolved with plus-addressing: {$collisions}");
        }
        $this->addReport('users', $total, $migrated, $skipped, $tenantId);

        return $map;
    }

    // ---------- Units (derived from products.size) ----------

    private function deriveUnits(string $conn, int $tenantId): array
    {
        $sizes = DB::connection($conn)->table('products')->whereNotNull('size')->distinct()->pluck('size');
        $map = []; // raw size → canonical unit id
        $nameToId = DB::table('product_units')->where('tenant_id', $tenantId)->pluck('id', 'name')->all();
        $migrated = 0;

        foreach ($sizes as $raw) {
            if ($raw === '' || $raw === null) {
                continue;
            }
            $canonical = self::UNIT_MAP[strtolower(trim($raw))] ?? ucwords(strtolower(trim($raw)));
            if (isset($nameToId[$canonical])) {
                $map[$raw] = $nameToId[$canonical];
                continue;
            }
            $id = DB::table('product_units')->insertGetId([
                'tenant_id' => $tenantId,
                'name' => $canonical,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $nameToId[$canonical] = $id;
            $map[$raw] = $id;
            $migrated++;
        }

        $this->addReport('product_units (derived)', count($sizes), $migrated, 0, $tenantId);

        return $map;
    }

    // ---------- Products ----------

    private function importProducts(string $conn, int $tenantId, int $chunk): array
    {
        $existing = DB::table('products')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('legacy_pid')->flip();
        $map = DB::table('products')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('id', 'legacy_pid')->all();
        $migrated = 0;
        $skipped = 0;

        $total = DB::connection($conn)->table('products')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('products')->orderBy('id')->chunk($chunk, function ($rows) use ($tenantId, &$existing, &$map, &$migrated, &$skipped) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();
                if ($existing->has($r->pid)) {
                    $skipped++;
                    continue;
                }
                $batch[] = [
                    'tenant_id' => $tenantId,
                    'name' => $r->name,
                    'description' => $r->description,
                    'size' => $r->size,
                    'model' => $r->model,
                    'department' => $r->department,
                    'quantity' => $this->toDecimal($r->quantity),
                    'cost_price' => $this->toDecimal($r->cost_price),
                    'selling_price' => $this->toDecimal($r->selling_price),
                    'reorder_level' => (int) ($r->replenishment ?? 1),
                    'barcode' => $r->code,
                    'legacy_pid' => $r->pid,
                    'image' => $r->path,
                    'manufacture_date' => $this->parseDate($r->manufacture_date),
                    'expire_date' => $this->parseDate($r->expire_date),
                    'is_active' => true,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
            }
            if ($batch) {
                DB::table('products')->insert($batch);
                // Re-fetch the just-inserted rows by legacy_pid to build the map.
                $pids = array_column($batch, 'legacy_pid');
                $newRows = DB::table('products')->where('tenant_id', $tenantId)->whereIn('legacy_pid', $pids)->pluck('id', 'legacy_pid');
                foreach ($newRows as $pid => $id) {
                    $map[$pid] = $id;
                    $existing[$pid] = true;
                }
                $migrated += count($batch);
            }
        });

        $this->output->progressFinish();
        $this->addReport('products', $total, $migrated, $skipped, $tenantId);

        return $map;
    }

    // ---------- Orders ----------

    private function importOrders(string $conn, int $tenantId, array $userPidMap, int $chunk): array
    {
        $branchId = DB::table('branches')->where('tenant_id', $tenantId)->value('id');

        // Resume guard keyed on the v2 number, which is unique per tenant.
        $existingNumbers = DB::table('orders')->where('tenant_id', $tenantId)->pluck('number')->flip();
        $migrated = 0;
        $skipped = 0;
        $suffixed = 0;

        // The legacy order_id was meant to be unique but a handful of rows collide:
        // a completed sale and a stray pending row share the same order_id (e.g.
        // 25APR21016). Pick a "primary" per duplicated order_id — the completed/credit
        // order, else the lowest id — to keep the clean number; the stray rows get a
        // "-<legacyId>" suffix so the unique (tenant_id, number) holds. legacy_number
        // keeps the original order_id for every row, so nothing is lost.
        $dupPrimary = [];
        foreach (DB::connection($conn)->table('orders')
            ->select('order_id', DB::raw('MIN(CASE WHEN status IN (1,2,3) THEN id END) AS completed_id'), DB::raw('MIN(id) AS min_id'))
            ->groupBy('order_id')
            ->havingRaw('COUNT(*) > 1')
            ->get() as $row) {
            $dupPrimary[$row->order_id] = $row->completed_id ?? $row->min_id;
        }

        $total = DB::connection($conn)->table('orders')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('orders')->orderBy('id')->chunk($chunk, function ($rows) use ($tenantId, $branchId, $userPidMap, $dupPrimary, &$existingNumbers, &$migrated, &$skipped, &$suffixed) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();

                $number = $this->resolveOrderNumber($r->order_id, (int) $r->id, $dupPrimary);
                if ($number !== $r->order_id) {
                    $suffixed++;
                }

                if ($existingNumbers->has($number)) {
                    $skipped++;
                    continue;
                }

                $status = match ((int) $r->status) {
                    1 => OrderStatus::Completed->value,
                    2, 3 => OrderStatus::Credit->value,
                    default => OrderStatus::Pending->value,
                };

                $discount = $this->toDecimal($r->discount);
                $meta = null;
                if ($r->address || $r->email) {
                    $meta = array_filter(['address' => $r->address, 'email' => $r->email], fn ($v) => $v !== null && $v !== '');
                    $meta = $meta ? $meta : null;
                }

                // Pending orders had NULL totals — derive from details later is
                // expensive here; store what we have. The totals are recomputed
                // below from order_details for pending rows.
                $totalAmount = $this->toDecimal($r->total);
                $amountPaid = $this->toDecimal($r->amount_paid);

                $batch[] = [
                    'tenant_id' => $tenantId,
                    'branch_id' => $branchId,
                    'device_id' => null,
                    'user_id' => $userPidMap[$r->user_pid] ?? null,
                    'number' => $number,
                    'legacy_number' => $r->order_id,
                    'uuid' => \Illuminate\Support\Str::uuid()->toString(),
                    'subtotal' => $totalAmount !== '0.0000' ? bcadd($totalAmount, $discount, 4) : '0.0000',
                    'discount' => $discount,
                    'total' => $totalAmount,
                    'amount_paid' => $amountPaid,
                    'change' => bccomp($amountPaid, $totalAmount) > 0 ? bcsub($amountPaid, $totalAmount, 4) : '0.0000',
                    'status' => $status,
                    'customer_id' => null,
                    'customer_name' => $r->name,
                    'customer_phone' => $r->gsm,
                    'note' => null,
                    'legacy_meta' => $meta ? json_encode($meta) : null,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
                $existingNumbers[$number] = true;
            }
            if ($batch) {
                DB::table('orders')->insert($batch);
                $migrated += count($batch);
            }
        });

        $this->output->progressFinish();
        if ($suffixed > 0) {
            $this->warn("  Duplicate order_ids disambiguated (stray rows suffixed): {$suffixed}");
        }

        // Map order_id → v2 id of the primary order (number == legacy_number). For
        // a non-duplicated order_id that is the only order; for a duplicated one it
        // is the completed/credit row. order_details and payments attach there.
        $map = DB::table('orders')->where('tenant_id', $tenantId)
            ->whereColumn('number', 'legacy_number')
            ->pluck('id', 'legacy_number')->all();

        $this->addReport('orders', $total, $migrated, $skipped, $tenantId);

        return $map;
    }

    // ---------- Order details ----------

    private function importOrderDetails(string $conn, int $tenantId, array $orderNumberMap, array $productPidMap, int $chunk): void
    {
        // Orders that already had items BEFORE this run are skipped (resume guard).
        // This snapshot is intentionally not mutated during the run — marking an
        // order mid-run would drop its line items that fall in a later chunk.
        $ordersWithItems = DB::table('order_items')->pluck('order_id')->flip();
        // Product name/barcode/cost keyed by v2 id — one query instead of three
        // per order_details line (244k+ lines).
        $products = DB::table('products')->where('tenant_id', $tenantId)
            ->select('id', 'name', 'barcode', 'cost_price')->get()->keyBy('id');
        $migrated = 0;
        $orphaned = 0;

        $total = DB::connection($conn)->table('order_details')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('order_details')->orderBy('id')->chunk($chunk, function ($rows) use ($productPidMap, $orderNumberMap, $ordersWithItems, $products, &$migrated, &$orphaned) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();
                $orderId = $orderNumberMap[$r->order_id] ?? null;
                if (! $orderId) {
                    $orphaned++;
                    continue;
                }
                if ($ordersWithItems->has($orderId)) {
                    continue; // order already had its items before this run
                }
                $productId = $productPidMap[$r->product_pid] ?? null;
                if (! $productId) {
                    $orphaned++;
                    continue;
                }
                $product = $products->get($productId);
                $qty = $this->toDecimal($r->quantity);
                $unitPrice = $this->toDecimal($r->price);
                $batch[] = [
                    'order_id' => $orderId,
                    'product_id' => $productId,
                    'product_name' => $product?->name,
                    'barcode' => $product?->barcode,
                    'quantity' => $qty,
                    'unit_price' => $unitPrice,
                    'cost_price' => $product?->cost_price ?? '0.0000',
                    'line_total' => bcmul($qty, $unitPrice, 4),
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->created_at ?? $now,
                ];
                $migrated++;
            }
            if ($batch) {
                DB::table('order_items')->insert($batch);
            }
        });

        $this->output->progressFinish();

        // Backfill totals for pending orders that had NULL totals.
        $this->backfillPendingOrderTotals($tenantId);

        if ($orphaned > 0) {
            $this->warn("  order_details orphaned (no matching order/product): {$orphaned}");
        }
        $this->addReport('order_details', $total, $migrated, 0, $tenantId);
    }

    private function backfillPendingOrderTotals(int $tenantId): void
    {
        $pending = DB::table('orders')->where('tenant_id', $tenantId)->where('status', OrderStatus::Pending->value)->where('total', '0.0000')->pluck('id');
        foreach ($pending as $orderId) {
            $items = DB::table('order_items')->where('order_id', $orderId)->selectRaw('COALESCE(SUM(line_total),0) as subtotal')->first();
            $subtotal = (string) $items->subtotal;
            $total = $subtotal; // pending has no discount captured on the row
            DB::table('orders')->where('id', $orderId)->update([
                'subtotal' => $subtotal,
                'total' => $total,
            ]);
        }
    }

    // ---------- Payments ----------

    private function importPayments(string $conn, int $tenantId, array $orderNumberMap, array $userPidMap, int $chunk): void
    {
        // payments has no tenant_id, so scope the idempotency set through the
        // tenant's orders — otherwise legacy payment ids collide across tenants
        // (both DBs number from 1) and the second tenant's rows get skipped.
        $existingLegacy = DB::table('payments')
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->where('orders.tenant_id', $tenantId)
            ->whereNotNull('payments.legacy_id')
            ->pluck('payments.legacy_id')->flip();
        $migrated = 0;

        $total = DB::connection($conn)->table('payments')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('payments')->orderBy('id')->chunk($chunk, function ($rows) use ($orderNumberMap, $userPidMap, &$existingLegacy, &$migrated, $tenantId) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();
                if ($existingLegacy->has($r->id)) {
                    continue;
                }
                $orderId = $orderNumberMap[$r->order_id] ?? null;
                if (! $orderId) {
                    continue;
                }
                $userId = $userPidMap[$r->user_pid] ?? null;
                $kind = ((string) $r->type) === '1' ? 'instance' : 'balance';

                foreach (['pos' => 'pos', 'cash' => 'cash', 'transfer' => 'transfer'] as $col => $method) {
                    $amount = $this->toDecimal($r->$col);
                    if (bccomp($amount, '0') <= 0) {
                        continue;
                    }
                    $batch[] = [
                        'order_id' => $orderId,
                        'user_id' => $userId,
                        'method' => $method,
                        'amount' => $amount,
                        'kind' => $kind,
                        'legacy_id' => $r->id,
                        'created_at' => $r->created_at ?? $now,
                        'updated_at' => $r->created_at ?? $now,
                    ];
                    $migrated++;
                }
                $existingLegacy[$r->id] = true;
            }
            if ($batch) {
                DB::table('payments')->insert($batch);
            }
        });

        $this->output->progressFinish();
        $this->addReport('payments', $total, $migrated, 0, $tenantId);
    }

    // ---------- Expense categories + expenses ----------

    private function importExpenseCategories(string $conn, int $tenantId, int $chunk): array
    {
        $existing = DB::table('expense_categories')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('legacy_pid')->flip();
        $map = DB::table('expense_categories')->where('tenant_id', $tenantId)->whereNotNull('legacy_pid')->pluck('id', 'legacy_pid')->all();
        $migrated = 0;

        $total = DB::connection($conn)->table('expense_categories')->count();
        if ($total === 0) {
            $this->addReport('expense_categories', 0, 0, 0, $tenantId);
            return $map;
        }

        DB::connection($conn)->table('expense_categories')->orderBy('id')->chunk($chunk, function ($rows) use ($tenantId, &$existing, &$map, &$migrated) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                if ($existing->has($r->pid)) {
                    continue;
                }
                $batch[] = [
                    'tenant_id' => $tenantId,
                    'name' => strtoupper($r->name),
                    'description' => $r->description,
                    'legacy_pid' => $r->pid,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
            }
            if ($batch) {
                DB::table('expense_categories')->insert($batch);
                $pids = array_column($batch, 'legacy_pid');
                foreach (DB::table('expense_categories')->where('tenant_id', $tenantId)->whereIn('legacy_pid', $pids)->pluck('id', 'legacy_pid') as $pid => $id) {
                    $map[$pid] = $id;
                    $existing[$pid] = true;
                }
                $migrated += count($batch);
            }
        });

        $this->addReport('expense_categories', $total, $migrated, 0, $tenantId);

        return $map;
    }

    private function importExpenses(string $conn, int $tenantId, array $catMap, array $userPidMap, int $chunk): void
    {
        $existing = DB::table('expenses')->where('tenant_id', $tenantId)->whereNotNull('legacy_id')->pluck('legacy_id')->flip();
        $migrated = 0;

        $total = DB::connection($conn)->table('expenses')->count();
        if ($total === 0) {
            $this->addReport('expenses', 0, 0, 0, $tenantId);
            return;
        }

        $this->output->progressStart($total);
        DB::connection($conn)->table('expenses')->orderBy('id')->chunk($chunk, function ($rows) use ($tenantId, $catMap, $userPidMap, &$existing, &$migrated) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();
                if ($existing->has($r->id)) {
                    continue;
                }
                $batch[] = [
                    'tenant_id' => $tenantId,
                    'expense_category_id' => $catMap[$r->category_pid] ?? null,
                    'user_id' => $userPidMap[$r->user_pid] ?? null,
                    'description' => $r->expense,
                    'amount' => $this->toDecimal($r->amount),
                    'date' => $this->parseDate($r->date) ?? $now,
                    'legacy_id' => $r->id,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
                $migrated++;
            }
            if ($batch) {
                DB::table('expenses')->insert($batch);
                foreach ($batch as $b) {
                    $existing[$b['legacy_id']] = true;
                }
            }
        });
        $this->output->progressFinish();

        $this->addReport('expenses', $total, $migrated, 0, $tenantId);
    }

    // ---------- Daily logs ----------

    private function importDailyLogs(string $conn, int $tenantId, array $userPidMap, int $chunk): void
    {
        // Legacy can have several daily_logs rows for the same date; keep one per
        // (tenant, date), taking the cashier from the earliest row. Upsert on the
        // unique (tenant_id, date) makes the import re-runnable.
        $groupCount = (int) (DB::connection($conn)->selectOne("SELECT COUNT(*) AS c FROM (SELECT date FROM daily_logs GROUP BY date) t")?->c ?? 0);
        if ($groupCount === 0) {
            $this->addReport('daily_logs', 0, 0, 0, $tenantId);
            return;
        }

        $rows = DB::connection($conn)->select(
            "SELECT g.date, g.legacy_id, f.user_pid, f.created_at, f.updated_at
             FROM (SELECT date, MIN(id) AS legacy_id FROM daily_logs GROUP BY date) g
             JOIN daily_logs f ON f.id = g.legacy_id
             ORDER BY g.legacy_id"
        );

        $now = now();
        $batch = [];
        foreach ($rows as $r) {
            $batch[] = [
                'tenant_id' => $tenantId,
                'date' => $this->parseDate($r->date) ?? $now->toDateString(),
                'user_id' => $userPidMap[$r->user_pid] ?? null,
                'legacy_id' => $r->legacy_id,
                'created_at' => $r->created_at ?? $now,
                'updated_at' => $r->updated_at ?? $now,
            ];
        }
        if ($batch) {
            DB::table('daily_logs')->upsert($batch, ['tenant_id', 'date'], ['user_id', 'legacy_id', 'updated_at']);
        }

        $this->addReport('daily_logs', $groupCount, count($batch), 0, $tenantId);
    }

    // ---------- Product cards (the big one) ----------

    private function importProductCards(string $conn, int $tenantId, array $productPidMap, array $userPidMap, int $chunk): void
    {
        // Legacy wrote a card row per sale/restock event, so a (product, day) can
        // span several rows that share the day's opening with per-event counters
        // (and later backfill rows carry a drifted "current quantity" as opening).
        // Coalesce into one card per (tenant, product, date): opening + cost/sell
        // price + size + user come from the earliest row (MIN id — closest to the
        // real day-opening); added/reversed/sold are summed across the day. Upsert
        // on the unique (tenant_id, product_id, date) makes the import re-runnable.
        $groupCount = (int) (DB::connection($conn)->selectOne("SELECT COUNT(*) AS c FROM (SELECT product_pid, date FROM product_cards GROUP BY product_pid, date) t")?->c ?? 0);
        $migrated = 0;
        $orphaned = 0;
        $now = now();
        $today = $now->toDateString();

        $this->output->progressStart($groupCount);

        $sql = "SELECT g.legacy_id, g.product_pid, g.date, g.added, g.reversed, g.sold,
                       f.quantity AS opening, f.cost_price, f.selling_price, f.size, f.user_pid,
                       f.created_at, f.updated_at
                FROM (
                    SELECT product_pid, date, MIN(id) AS legacy_id,
                           SUM(`update`) AS added, SUM(reversed) AS reversed, SUM(sold) AS sold
                    FROM product_cards
                    GROUP BY product_pid, date
                ) g
                JOIN product_cards f ON f.id = g.legacy_id
                ORDER BY g.legacy_id";

        // Stream the grouped result unbuffered (~740k groups) so PHP memory stays
        // flat; the upserts go to the default connection, leaving this one free.
        $pdo = DB::connection($conn)->getPdo();
        $buffered = $pdo->getAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY);
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);

        $batch = [];
        try {
            $stmt = $pdo->query($sql);
            while ($r = $stmt->fetch(PDO::FETCH_OBJ)) {
                $this->output->progressAdvance();
                $productId = $productPidMap[$r->product_pid] ?? null;
                if (! $productId) {
                    $orphaned++;
                    continue;
                }
                $batch[] = [
                    'tenant_id' => $tenantId,
                    'product_id' => $productId,
                    'date' => $this->parseDate($r->date) ?? $today,
                    'opening' => $this->toDecimal($r->opening),
                    'added' => $this->toDecimal($r->added),
                    'reversed' => $this->toDecimal($r->reversed),
                    'sold' => $this->toDecimal($r->sold),
                    'cost_price' => $this->toDecimal($r->cost_price),
                    'selling_price' => $this->toDecimal($r->selling_price),
                    'size' => $r->size,
                    'user_id' => $userPidMap[$r->user_pid] ?? null,
                    'legacy_id' => $r->legacy_id,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
                $migrated++;
                if (count($batch) >= $chunk) {
                    $this->upsertProductCards($batch);
                    $batch = [];
                }
            }
            if ($batch) {
                $this->upsertProductCards($batch);
            }
        } finally {
            $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, $buffered);
        }

        $this->output->progressFinish();
        if ($orphaned > 0) {
            $this->warn("  product_cards orphaned (no matching product): {$orphaned}");
        }
        $this->addReport('product_cards', $groupCount, $migrated, 0, $tenantId);
    }

    private function upsertProductCards(array $batch): void
    {
        DB::transaction(fn () => DB::table('product_cards')->upsert(
            $batch,
            ['tenant_id', 'product_id', 'date'],
            ['opening', 'added', 'reversed', 'sold', 'cost_price', 'selling_price', 'size', 'user_id', 'legacy_id', 'updated_at']
        ));
    }

    // ---------- Consignments ----------

    private function importConsignments(string $conn, int $tenantId, array $userPidMap, int $chunk): void
    {
        $existing = DB::table('product_consignments')->where('tenant_id', $tenantId)->whereNotNull('legacy_id')->pluck('legacy_id')->flip();
        $migrated = 0;

        $total = DB::connection($conn)->table('product_consignments')->count();
        $this->output->progressStart($total);

        DB::connection($conn)->table('product_consignments')->orderBy('id')->chunk($chunk, function ($rows) use ($tenantId, $userPidMap, &$existing, &$migrated) {
            $now = now();
            $batch = [];
            foreach ($rows as $r) {
                $this->output->progressAdvance();
                if ($existing->has($r->id)) {
                    continue;
                }
                $userId = $userPidMap[$r->user_pid] ?? null;
                if (! $userId) {
                    continue;
                }
                $batch[] = [
                    'tenant_id' => $tenantId,
                    'user_id' => $userId,
                    'name' => $r->name,
                    'description' => $r->description,
                    'model' => $r->model,
                    'size' => $r->size,
                    'department' => $r->department,
                    'category' => $r->category,
                    'category_id' => null,
                    'quantity' => $this->toDecimal($r->quantity),
                    'unit_cost' => $this->toDecimal($r->unit_cost),
                    'unit_price' => $this->toDecimal($r->unit_price),
                    'unit_profit' => $this->toDecimal($r->unit_profit),
                    'image' => $r->path,
                    'consignment' => $r->consignment,
                    'manufacture_date' => $this->parseDate($r->manufacture_date),
                    'expire_date' => $this->parseDate($r->expire_date),
                    'date' => $this->parseDate($r->date),
                    'barcode' => $r->code,
                    'legacy_id' => $r->id,
                    'created_at' => $r->created_at ?? $now,
                    'updated_at' => $r->updated_at ?? $now,
                ];
                $migrated++;
            }
            if ($batch) {
                DB::table('product_consignments')->insert($batch);
                foreach ($batch as $b) {
                    $existing[$b['legacy_id']] = true;
                }
            }
        });

        $this->output->progressFinish();
        $this->addReport('product_consignments', $total, $migrated, 0, $tenantId);
    }

    // ---------- Dry run ----------

    private function dryRun(string $conn, array $t): void
    {
        $tables = [
            'users', 'products', 'orders', 'order_details', 'payments',
            'expense_categories', 'expenses', 'daily_logs', 'product_cards', 'product_consignments',
        ];
        $this->info("  Legacy row counts ({$t['slug']}):");
        foreach ($tables as $table) {
            $count = DB::connection($conn)->table($table)->count();
            $this->line("    {$table}: {$count}");
            $this->report[] = ['tenant' => $t['slug'], 'table' => $table, 'legacy' => $count, 'migrated' => 0, 'skipped' => 0];
        }

        // Email collision pre-scan across both legacy DBs.
        $emails = DB::connection($conn)->table('users')->pluck('email');
        $other = collect(self::TENANTS)->firstWhere('slug', '!==', $t['slug']);
        if ($other) {
            $otherEmails = DB::connection($other['conn'])->table('users')->pluck('email')->flip();
            $collisions = $emails->filter(fn ($e) => $otherEmails->has($e));
            if ($collisions->isNotEmpty()) {
                $this->warn("  Email collisions with {$other['slug']}: " . $collisions->implode(', '));
            }
        }
    }

    // ---------- Helpers ----------

    private function toDecimal($value): string
    {
        if ($value === null || $value === '') {
            return '0.0000';
        }
        return bcadd((string) $value, '0', 4);
    }

    /**
     * Decide an order's v2 number. A duplicated legacy order_id keeps its clean
     * number for the chosen primary row; every other row in the group is
     * disambiguated with a "-<legacyId>" suffix so (tenant_id, number) stays unique.
     */
    private function resolveOrderNumber(string $orderId, int $rowId, array $dupPrimary): string
    {
        if (isset($dupPrimary[$orderId]) && $rowId !== (int) $dupPrimary[$orderId]) {
            return $orderId.'-'.$rowId;
        }

        return $orderId;
    }

    private function parseDate(?string $value): ?string
    {
        if (! $value || $value === '0000-00-00' || str_starts_with($value, '0000-00-00')) {
            return null;
        }
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable $e) {
            Log::warning('legacy date parse failed', ['value' => $value]);
            return null;
        }
    }

    private function plusAddress(string $email, string $suffix): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        if (! $domain) {
            return $email;
        }
        $local = preg_replace('/\+.*$/', '', $local);

        return "{$local}+{$suffix}@{$domain}";
    }

    private function addReport(string $table, int $legacy, int $migrated, int $skipped, int $tenantId): void
    {
        $this->report[] = [
            'tenant' => $tenantId === 1 ? 'supermarket' : 'pharmacy',
            'table' => $table,
            'legacy' => $legacy,
            'migrated' => $migrated,
            'skipped' => $skipped,
        ];
    }

    private function printReport(): void
    {
        $this->newLine();
        $this->info('Reconciliation:');
        $rows = array_map(fn ($r) => [
            $r['tenant'], $r['table'], $r['legacy'], $r['migrated'], $r['skipped'],
        ], $this->report);
        $this->table(['Tenant', 'Table', 'Legacy', 'Migrated', 'Skipped'], $rows);
    }
}