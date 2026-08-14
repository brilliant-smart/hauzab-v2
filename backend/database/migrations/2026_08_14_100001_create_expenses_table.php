<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('expense_category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Legacy `expense` free-text.
            $table->string('description');
            $table->decimal('amount', 16, 4)->default(0);
            $table->date('date');

            $table->unsignedBigInteger('legacy_id')->nullable();

            $table->timestamps();

            $table->index(['tenant_id', 'date']);
            $table->index('expense_category_id');
            $table->index('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};