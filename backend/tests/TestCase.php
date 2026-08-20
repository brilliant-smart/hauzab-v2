<?php

namespace Tests;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    // Apply the trait here, in the base class, rather than in each leaf test.
    // The migrateDatabases() override below is then this class's own method
    // and takes precedence over the trait's default. When RefreshDatabase is
    // applied in a leaf class instead, the trait's method shadows this parent
    // override — and the trait's default runs `migrate:fresh`, which drops
    // every table in the database regardless of the table prefix, wiping the
    // live schema. Leaf test classes inherit this and must not re-apply the
    // trait.
    use RefreshDatabase;

    /**
     * Migrate the fixture tables without touching the live schema.
     *
     * The suite shares the live MySQL server using a `test_` table prefix
     * (see phpunit.xml), so only the prefixed tables are dropped and a plain
     * `migrate` is run — never `migrate:fresh`, which would drop the live
     * tables too.
     */
    protected function migrateDatabases(): void
    {
        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");
        $prefix = (string) config("database.connections.{$connection}.prefix", '');

        if ($database !== null && $prefix !== '') {
            $tables = collect(DB::select(
                'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND LEFT(table_name, ?) = ?',
                [$database, strlen($prefix), $prefix]
            ))->pluck('name');

            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            foreach ($tables as $table) {
                DB::statement('DROP TABLE IF EXISTS `'.$table.'`');
            }
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $this->artisan('migrate', ['--force' => true])->run();
    }
}