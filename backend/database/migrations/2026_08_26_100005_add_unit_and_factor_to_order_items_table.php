<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            // The unit a line was sold in (null/omitted = the product's base
            // unit, factor 1). Lets a receipt show "1 Carton" rather than "24
            // Singles" while stock is still decremented in base units.
            $table->foreignId('unit_id')->nullable()->constrained('product_units')->nullOnDelete()->after('quantity');

            // Base units per sale unit for this line. Null = 1 (base unit).
            $table->decimal('factor', 16, 4)->nullable()->after('unit_id');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['unit_id']);
            $table->dropColumn(['unit_id', 'factor']);
        });
    }
};