<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    /**
     * RefreshDatabase defaults to `migrate:fresh`, which wipes every table in the
     * configured database. The suite runs against the shared MySQL server with a
     * `test_` table prefix (see phpunit.xml), so only the prefixed fixture tables
     * are dropped and re-migrated — the live schema is never touched.
     */
    protected function migrateDatabases()
    {
        $prefix = Schema::getConnection()->getTablePrefix();

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        foreach (Schema::getTableListing() as $table) {
            if (str_starts_with($table, $prefix)) {
                Schema::dropIfExists($table);
            }
        }
        DB::statement('SET FOREIGN_KEY_CHECKS=1');

        $this->artisan('migrate')->run();
    }
}