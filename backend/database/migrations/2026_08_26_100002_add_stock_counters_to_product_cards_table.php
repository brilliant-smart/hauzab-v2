<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_cards', function (Blueprint $table) {
            // Non-sale stock changes need their own counters so the daily card
            // still reconciles to products.quantity (the H1 invariant):
            // closing = opening + added - sold + reversed - written_off + count_adj.
            $table->decimal('written_off', 16, 4)->default(0)->after('sold');
            $table->decimal('count_adj', 16, 4)->default(0)->after('written_off');
        });
    }

    public function down(): void
    {
        Schema::table('product_cards', function (Blueprint $table) {
            $table->dropColumn(['written_off', 'count_adj']);
        });
    }
};