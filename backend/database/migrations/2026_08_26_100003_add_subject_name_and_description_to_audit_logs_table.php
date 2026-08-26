<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            // Human-readable subject name + a one-line description so a
            // non-developer auditor can read the trail without resolving ids.
            $table->string('subject_name')->nullable()->after('subject_id');
            $table->string('description')->nullable()->after('subject_name');

            $table->index(['tenant_id', 'created_at']);
            $table->index(['subject_type', 'subject_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['audit_logs_subject_type_subject_id_created_at_index']);
            $table->dropIndex(['audit_logs_tenant_id_created_at_index']);
            $table->dropColumn(['subject_name', 'description']);
        });
    }
};