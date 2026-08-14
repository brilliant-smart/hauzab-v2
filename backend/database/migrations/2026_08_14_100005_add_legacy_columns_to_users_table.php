<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Lossless legacy identity for the migration command's idempotency.
            $table->string('legacy_pid')->nullable()->after('email');
            // Overflow bucket — e.g. the original email on a collision.
            $table->json('legacy_meta')->nullable()->after('legacy_pid');

            $table->index('legacy_pid');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['legacy_pid']);
            $table->dropColumn(['legacy_pid', 'legacy_meta']);
        });
    }
};