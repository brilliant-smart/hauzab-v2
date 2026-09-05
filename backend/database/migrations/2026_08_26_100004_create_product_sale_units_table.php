<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_sale_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained('product_units')->cascadeOnDelete();

            // How many base units one of this sale unit contains (e.g. 24 for a
            // carton of singles). Stock is always held in the base unit; the
            // factor converts a sale-unit quantity to a base-unit quantity.
            $table->decimal('factor', 16, 4);

            // Price charged for one of this sale unit (e.g. the carton price).
            // Must stay at or above base cost_price * factor so a carton is
            // never sold below cost (enforced in the controller).
            $table->decimal('selling_price', 16, 4);

            $table->timestamps();

            // A product sells in any given unit at most once.
            $table->unique(['product_id', 'unit_id']);
            $table->index(['tenant_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_sale_units');
    }
};