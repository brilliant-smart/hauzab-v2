<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // received | write_off | count | sale | void | transfer (Phase 2)
            $table->string('type', 30)->index();

            // Signed base-unit delta. Negative for sale/write_off, positive for
            // received/void. Always expressed in the base (single) unit.
            $table->decimal('delta', 16, 4)->default(0);

            // Stock on each side of the movement, so the ledger is self-auditing
            // without needing to replay every card.
            $table->decimal('quantity_before', 16, 4)->default(0);
            $table->decimal('quantity_after', 16, 4)->default(0);

            // Phase 2 carton context (nullable, unused in Phase 1).
            $table->foreignId('unit_id')->nullable()->constrained('product_units')->nullOnDelete();
            $table->decimal('factor', 16, 4)->nullable();

            // Optional link to the document that triggered the movement
            // (e.g. an order on a void, a consignment on a receive).
            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();

            // purchase|damage|expiry|consolidation|correction|found|recount|opening
            $table->string('reason')->nullable();
            $table->string('note')->nullable();

            // Append-only: no updated_at.
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};