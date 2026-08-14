<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\Tenant;
use App\Services\StockLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Open today's product_cards row for every active product in every tenant,
 * capturing the start-of-day opening stock. Gives an accurate opening figure
 * for the Sales Audit report on days with no sales for a product. The lazy
 * seed-on-first-sale path in StockLedger is the correctness floor when this
 * midnight job has not run (e.g. a branch that lost power overnight).
 */
class SeedProductCardsTodayCommand extends Command
{
    protected $signature = 'product-cards:seed-today';

    protected $description = 'Open today\'s stock ledger card for every active product';

    public function handle(StockLedger $ledger): int
    {
        $date = Carbon::today();
        $tenants = Tenant::all();

        foreach ($tenants as $tenant) {
            $count = 0;
            Product::where('tenant_id', $tenant->id)
                ->where('is_active', true)
                ->chunkById(500, function ($products) use ($ledger, $tenant, $date, &$count) {
                    foreach ($products as $product) {
                        $ledger->seedDay($tenant->id, $product->id, null, $date);
                        $count++;
                    }
                });

            $this->info("Tenant {$tenant->name}: seeded {$count} cards for {$date->toDateString()}.");
        }

        return self::SUCCESS;
    }
}