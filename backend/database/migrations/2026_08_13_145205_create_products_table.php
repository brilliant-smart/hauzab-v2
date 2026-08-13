<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('description')->nullable();
            $table->string('size')->nullable();
            $table->string('model')->nullable();
            $table->string('department')->nullable();

            $table->foreignId('category_id')->nullable()->constrained('product_categories')->nullOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained('product_units')->nullOnDelete();
            $table->foreignId('manufacturer_id')->nullable()->constrained('product_manufacturers')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('product_suppliers')->nullOnDelete();

            $table->decimal('quantity', 16, 4)->default(0);
            $table->decimal('cost_price', 16, 4)->default(0);
            $table->decimal('selling_price', 16, 4)->default(0);
            $table->unsignedInteger('reorder_level')->default(1);

            $table->string('barcode')->nullable();
            $table->string('image')->nullable();
            $table->date('manufacture_date')->nullable();
            $table->date('expire_date')->nullable();

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('tenant_id');
            $table->unique(['tenant_id', 'barcode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};