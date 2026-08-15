<?php

namespace Tests\Unit;

use App\Console\Commands\MigrateLegacyCommand;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Pure helper coverage for the legacy migration command. The full migrate:legacy
 * run is excluded here — it needs the real legacy_* MySQL databases and is verified
 * manually (see DEPLOY.md, @group legacy).
 */
class MigrateLegacyHelpersTest extends TestCase
{
    private MigrateLegacyCommand $command;

    protected function setUp(): void
    {
        parent::setUp();
        $this->command = app(MigrateLegacyCommand::class);
    }

    private function invoke(string $method, array $args)
    {
        $ref = new ReflectionMethod($this->command, $method);
        $ref->setAccessible(true);

        return $ref->invokeArgs($this->command, $args);
    }

    public function test_to_decimal_normalizes_null_empty_and_numeric_strings(): void
    {
        $this->assertSame('0.0000', $this->invoke('toDecimal', [null]));
        $this->assertSame('0.0000', $this->invoke('toDecimal', ['']));
        $this->assertSame('12.5000', $this->invoke('toDecimal', ['12.5']));
        $this->assertSame('100.0000', $this->invoke('toDecimal', ['100']));
        $this->assertSame('0.9900', $this->invoke('toDecimal', ['0.99']));
    }

    public function test_to_decimal_truncates_to_four_places(): void
    {
        $this->assertSame('1.2345', $this->invoke('toDecimal', ['1.23456']));
    }

    public function test_resolve_order_number_keeps_clean_id_when_not_duplicated(): void
    {
        // No entry for this order_id → it is unique, keep the clean number.
        $this->assertSame('25APR21001', $this->invoke('resolveOrderNumber', ['25APR21001', 5, []]));
    }

    public function test_resolve_order_number_keeps_clean_id_for_the_primary_row(): void
    {
        $dupPrimary = ['25APR21016' => 42];

        $this->assertSame('25APR21016', $this->invoke('resolveOrderNumber', ['25APR21016', 42, $dupPrimary]));
    }

    public function test_resolve_order_number_suffixes_stray_rows_in_a_duplicate_group(): void
    {
        $dupPrimary = ['25APR21016' => 42];

        $this->assertSame('25APR21016-77', $this->invoke('resolveOrderNumber', ['25APR21016', 77, $dupPrimary]));
        $this->assertSame('25APR21016-88', $this->invoke('resolveOrderNumber', ['25APR21016', 88, $dupPrimary]));
    }

    public function test_plus_address_injects_the_tenant_suffix_and_strips_an_existing_one(): void
    {
        $this->assertSame('jane+supermarket@example.com', $this->invoke('plusAddress', ['jane@example.com', 'supermarket']));
        $this->assertSame('jane+pharmacy@example.com', $this->invoke('plusAddress', ['jane+old@example.com', 'pharmacy']));
    }

    public function test_plus_address_leaves_a_local_only_string_untouched(): void
    {
        $this->assertSame('notanemail', $this->invoke('plusAddress', ['notanemail', 'supermarket']));
    }

    public function test_parse_date_returns_null_for_empty_or_zero_dates(): void
    {
        $this->assertNull($this->invoke('parseDate', [null]));
        $this->assertNull($this->invoke('parseDate', ['0000-00-00']));
        $this->assertNull($this->invoke('parseDate', ['0000-00-00 00:00:00']));
    }

    public function test_parse_date_returns_a_date_string_for_valid_input(): void
    {
        $this->assertSame('2025-04-25', $this->invoke('parseDate', ['2025-04-25 14:30:00']));
    }

    public function test_parse_date_returns_null_for_garbage_without_throwing(): void
    {
        $this->assertNull($this->invoke('parseDate', ['not-a-date']));
    }
}