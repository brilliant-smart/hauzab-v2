<?php

namespace App\Services;

use App\Models\DailyLog;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCard;
use Illuminate\Support\Carbon;

/**
 * Daily stock ledger. One product_cards row per product per tenant per day
 * captures opening/added/sold/reversed so the Sales Audit report can show a
 * per-product daily movement. Cards are per-instance reporting, not synced —
 * each instance derives its own from its own sales.
 *
 * Every method runs inside the caller's existing DB::transaction so a card
 * write shares the sale's atomicity and lock scope; no nested transaction,
 * no outbox, no audit.
 */
class StockLedger
{
    /**
     * Get-or-create the card for a product on a given day. Opening is captured
     * from the product's current quantity, so callers must seed BEFORE they
     * mutate stock. Race-safe: the unique(tenant_id, product_id, date) index
     * means the first writer sets opening and the second gets the existing row.
     */
    public function seedDay(int $tenantId, int $productId, ?int $userId, Carbon $date): ProductCard
    {
        // Gate the day — a daily_logs row marks that the day has been opened.
        DailyLog::firstOrCreate(
            ['tenant_id' => $tenantId, 'date' => $date->toDateString()],
            ['user_id' => $userId],
        );

        $product = Product::find($productId);

        return ProductCard::firstOrCreate(
            ['tenant_id' => $tenantId, 'product_id' => $productId, 'date' => $date->toDateString()],
            [
                'opening' => $product?->quantity ?? 0,
                'cost_price' => $product?->cost_price,
                'selling_price' => $product?->selling_price,
                'size' => $product?->size,
                'user_id' => $userId,
            ],
        );
    }

    /**
     * Record one sale line's stock movement. Call before decrementing the
     * product's quantity so opening reflects pre-sale stock. Used per-line
     * inside OrderPersistence::persist() where the order row does not exist yet.
     */
    public function applySaleLine(int $tenantId, int $productId, string $qty, ?int $userId, Carbon $date): void
    {
        if (bccomp($qty, '0') <= 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, $date);
        $card->increment('sold', $qty);
    }

    /**
     * Record a void's reversals against the day the sale originally happened.
     */
    public function recordVoid(Order $order): void
    {
        $date = Carbon::parse($order->created_at);

        foreach ($order->items as $item) {
            if (! $item->product_id) {
                continue;
            }
            $card = $this->seedDay($order->tenant_id, $item->product_id, $order->user_id, $date);
            $card->increment('reversed', (string) $item->quantity);
        }
    }

    /**
     * Record a restock delta (added stock) against today.
     */
    public function recordRestock(int $tenantId, int $productId, string $delta, ?int $userId): void
    {
        if (bccomp($delta, '0') <= 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, now());
        $card->increment('added', $delta);
    }
}