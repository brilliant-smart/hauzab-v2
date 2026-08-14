<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->date('date');

            $table->unsignedBigInteger('legacy_id')->nullable();

            $table->timestamps();

            // The gate: a tenant has at most one daily log per calendar day.
            $table->unique(['tenant_id', 'date']);
            $table->index('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_logs');
    }
};