<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('customer_phone')->nullable()->after('customer_name');
            // Overflow bucket for legacy fields with no new home (address, email).
            $table->json('legacy_meta')->nullable()->after('customer_phone');
            // Legacy order_id string — staff-recognizable number + idempotency key.
            $table->string('legacy_number')->nullable()->after('number');

            $table->index('legacy_number');
        });

        // Some legacy orders have no cashier recorded (NULL user_pid); allow a
        // nullable cashier so those rows import losslessly rather than being
        // attributed to the wrong staff member.
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->foreignId('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['legacy_number']);
            $table->dropColumn(['customer_phone', 'legacy_meta', 'legacy_number']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->foreignId('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};