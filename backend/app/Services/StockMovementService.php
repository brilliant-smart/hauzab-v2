<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;

/**
 * The single authority for mutating a product's stock. Every base-unit change
 * flows through record(): lock the product, compute before/after, hard-block
 * negatives, append a stock_movements row, bump the product_cards counter, then
 * persist the new quantity. Sales, voids, receives, write-offs and counts all
 * route here so the auditor has one complete, immutable trail.
 *
 * Each call runs inside the caller's existing DB::transaction (the sale flow,
 * the void flow, and the stock-action endpoints all open one); no nested
 * transaction is started here.
 */
class StockMovementService
{
    public function __construct(
        private readonly StockLedger $ledger,
    ) {
    }

    /**
     * Record one base-unit stock movement.
     *
     * @param  string  $type      received|write_off|count|sale|void|transfer
     * @param  string  $deltaQty  signed base-unit delta (negative reduces stock).
     *                            Ignored for `count` — the delta is derived from
     *                            `meta.counted` under the lock so quantity_after
     *                            always equals the counted value.
     * @param  array  $meta       optional: unit_id, factor, reference_type,
     *                            reference_id, reason, note, counted (for count),
     *                            date (for void — the sale date)
     */
    public function record(int $tenantId, int $productId, string $type, string $deltaQty, ?int $userId, array $meta = []): StockMovement
    {
        $product = Product::query()
            ->lockForUpdate()
            ->where('tenant_id', $tenantId)
            ->where('id', $productId)
            ->first();
        abort_if(! $product, 422, 'Product not found.');

        $before = (string) $product->quantity;

        // A count sets stock to an absolute counted value; derive the delta
        // under the lock so a concurrent receive can't make quantity_after
        // drift away from what was counted.
        if ($type === 'count') {
            $deltaQty = bcsub((string) ($meta['counted'] ?? '0'), $before, 4);
        }

        $after = bcadd($before, $deltaQty, 4);

        if (bccomp($after, '0') < 0) {
            abort(422, "Insufficient stock for {$product->name}.");
        }

        // Append the movement first — it is the source of truth and never changes.
        $movement = StockMovement::create([
            'tenant_id' => $tenantId,
            'product_id' => $productId,
            'user_id' => $userId,
            'type' => $type,
            'delta' => $deltaQty,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'unit_id' => $meta['unit_id'] ?? null,
            'factor' => $meta['factor'] ?? null,
            'reference_type' => $meta['reference_type'] ?? null,
            'reference_id' => $meta['reference_id'] ?? null,
            'reason' => $meta['reason'] ?? null,
            'note' => $meta['note'] ?? null,
        ]);

        // Bump the daily card BEFORE persisting the new quantity so the card's
        // opening captures pre-mutation stock (matches the sale-flow ordering).
        $this->bumpCard($tenantId, $productId, $userId, $type, $deltaQty, $meta);

        $product->quantity = $after;
        $product->save();

        return $movement;
    }

    private function bumpCard(int $tenantId, int $productId, ?int $userId, string $type, string $deltaQty, array $meta): void
    {
        switch ($type) {
            case 'received':
                $this->ledger->recordRestock($tenantId, $productId, $deltaQty, $userId);
                break;
            case 'sale':
                $this->ledger->applySaleLine($tenantId, $productId, $deltaQty, $userId, Carbon::now());
                break;
            case 'void':
                $date = $meta['date'] ?? Carbon::now();
                $this->ledger->recordVoidLine($tenantId, $productId, $deltaQty, $userId, $date instanceof Carbon ? $date : Carbon::parse($date));
                break;
            case 'write_off':
                $this->ledger->recordWriteOff($tenantId, $productId, $deltaQty, $userId);
                break;
            case 'count':
                $this->ledger->recordCount($tenantId, $productId, (string) ($meta['counted'] ?? '0'), $userId);
                break;
            case 'transfer':
                // Phase 2 — stock is a single base-unit number, so a repackage
                // moves no stock; the row above is the auditor-visible record.
                break;
        }
    }
};