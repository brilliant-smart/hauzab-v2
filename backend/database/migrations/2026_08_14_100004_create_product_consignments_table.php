<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_consignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('description')->nullable();
            $table->string('model')->nullable();
            $table->string('size')->nullable();
            $table->string('department')->nullable();

            // Legacy free-text category preserved for losslessness; the
            // resolved FK below is NULL when no matching category exists.
            $table->string('category')->nullable();
            $table->foreignId('category_id')->nullable()->constrained('product_categories')->nullOnDelete();

            $table->decimal('quantity', 16, 4)->default(0);
            $table->decimal('unit_cost', 16, 4)->default(0);
            $table->decimal('unit_price', 16, 4)->default(0);
            $table->decimal('unit_profit', 16, 4)->default(0);

            $table->string('image')->nullable();
            $table->string('consignment')->nullable();

            $table->date('manufacture_date')->nullable();
            $table->date('expire_date')->nullable();
            $table->date('date')->nullable();

            $table->string('barcode')->nullable();

            $table->unsignedBigInteger('legacy_id')->nullable();

            $table->timestamps();

            $table->index('tenant_id');
            $table->index('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_consignments');
    }
};