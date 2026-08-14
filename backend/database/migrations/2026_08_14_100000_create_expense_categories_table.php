<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();

            // Stored UPPERCASE to match the legacy invariant.
            $table->string('name');
            $table->string('description')->nullable();

            // Lossless legacy identity for the migration command's idempotency.
            $table->string('legacy_pid')->nullable();

            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
            $table->index('legacy_pid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_categories');
    }
};