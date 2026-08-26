<?php

namespace App\Services;

use App\Models\DailyLog;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductCard;
use Illuminate\Support\Carbon;

/**
 * Daily stock ledger. One product_cards row per product per tenant per day
 * captures opening/added/sold/reversed/written_off/count_adj so the Sales Audit
 * report can show a per-product daily movement and so products.quantity can be
 * reconciled (closing = opening + added - sold + reversed - written_off
 * + count_adj). Cards are per-instance reporting, not synced — each instance
 * derives its own from its own sales.
 *
 * These methods are pure card counters — they do NOT mutate products.quantity
 * and do NOT write stock_movements; StockMovementService owns both. Every
 * method runs inside the caller's existing DB::transaction.
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
     * Record one sale line's stock movement against a day. Call before the
     * product quantity is decremented so opening reflects pre-sale stock.
     * Accepts a signed delta (negative for a sale); the counter is a magnitude.
     */
    public function applySaleLine(int $tenantId, int $productId, string $qty, ?int $userId, Carbon $date): void
    {
        $qty = $this->magnitude($qty);
        if (bccomp($qty, '0') === 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, $date);
        $card->increment('sold', $qty);
    }

    /**
     * Record a void's reversal for one line against the day the sale happened.
     */
    public function recordVoidLine(int $tenantId, int $productId, string $qty, ?int $userId, Carbon $date): void
    {
        $qty = $this->magnitude($qty);
        if (bccomp($qty, '0') === 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, $date);
        $card->increment('reversed', $qty);
    }

    /**
     * Record a void for a whole order — kept for backward compatibility; the
     * void flow now goes through StockMovementService per line.
     */
    public function recordVoid(Order $order): void
    {
        $date = Carbon::parse($order->created_at);

        foreach ($order->items as $item) {
            if (! $item->product_id) {
                continue;
            }
            $this->recordVoidLine($order->tenant_id, $item->product_id, (string) $item->quantity, $order->user_id, $date);
        }
    }

    /**
     * Record a restock delta (added stock) against today.
     */
    public function recordRestock(int $tenantId, int $productId, string $delta, ?int $userId): void
    {
        $delta = $this->magnitude($delta);
        if (bccomp($delta, '0') === 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, now());
        $card->increment('added', $delta);
    }

    /**
     * Record a write-off (stock removed) against today.
     */
    public function recordWriteOff(int $tenantId, int $productId, string $delta, ?int $userId): void
    {
        $delta = $this->magnitude($delta);
        if (bccomp($delta, '0') === 0) {
            return;
        }

        $card = $this->seedDay($tenantId, $productId, $userId, now());
        $card->increment('written_off', $delta);
    }

    /**
     * Record a physical count against today. The count_adj counter is set so the
     * card closes at the counted figure: count_adj = counted - current_closing.
     */
    public function recordCount(int $tenantId, int $productId, string $counted, ?int $userId): void
    {
        $card = $this->seedDay($tenantId, $productId, $userId, now());

        // closing = opening + added - sold + reversed - written_off + count_adj.
        // The count adjusts count_adj so the card closes at `counted`.
        $currentClosing = bcadd((string) $card->opening, (string) $card->added, 4);
        $currentClosing = bcsub($currentClosing, (string) $card->sold, 4);
        $currentClosing = bcadd($currentClosing, (string) $card->reversed, 4);
        $currentClosing = bcsub($currentClosing, (string) $card->written_off, 4);
        $currentClosing = bcadd($currentClosing, (string) $card->count_adj, 4);

        $adj = bcsub($counted, $currentClosing, 4);

        if (bccomp($adj, '0') !== 0) {
            $card->increment('count_adj', $adj);
        }
    }

    private function magnitude(string $value): string
    {
        return bccomp($value, '0') < 0 ? bcmul($value, '-1', 4) : $value;
    }
};