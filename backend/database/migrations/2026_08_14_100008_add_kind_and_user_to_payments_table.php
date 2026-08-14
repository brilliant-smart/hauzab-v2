<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            // Legacy `type`: instance | balance.
            $table->string('kind')->nullable()->after('amount');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete()->after('order_id');
            $table->unsignedBigInteger('legacy_id')->nullable()->after('kind');

            $table->index('user_id');
            $table->index('legacy_id');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
            $table->dropIndex(['legacy_id']);
            $table->dropForeign(['user_id']);
            $table->dropColumn(['kind', 'user_id', 'legacy_id']);
        });
    }
};