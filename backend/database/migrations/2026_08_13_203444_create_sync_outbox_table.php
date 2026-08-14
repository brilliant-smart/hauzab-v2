<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_outbox', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();

            // 'order' or 'void' — keeps a single queue for both sale pushes
            // and the voids that follow them.
            $table->string('kind', 20)->default('order');
            $table->uuid('order_uuid')->index();

            // The exact body to POST to the cloud, snapshotted at enqueue time
            // so later local changes can't drift what the cloud received.
            $table->json('payload')->nullable();

            // pending | pushed | failed
            $table->string('status', 16)->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('pushed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'attempts']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_outbox');
    }
};