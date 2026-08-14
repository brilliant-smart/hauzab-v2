<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->date('date');

            // Stock movement counters for one product on one day.
            // closing = opening + added - sold (reversed is informational).
            $table->decimal('opening', 16, 4)->default(0);
            $table->decimal('added', 16, 4)->default(0);
            $table->decimal('reversed', 16, 4)->default(0);
            $table->decimal('sold', 16, 4)->default(0);

            $table->decimal('cost_price', 16, 4)->nullable();
            $table->decimal('selling_price', 16, 4)->nullable();
            $table->string('size')->nullable();

            $table->unsignedBigInteger('legacy_id')->nullable();

            $table->timestamps();

            // One row per product per day per tenant.
            $table->unique(['tenant_id', 'product_id', 'date']);
            $table->index(['tenant_id', 'date']);
            $table->index('product_id');
            $table->index('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_cards');
    }
};