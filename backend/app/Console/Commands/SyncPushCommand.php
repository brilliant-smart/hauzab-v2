<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\SyncOutbox;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Drain the campus sync_outbox to the cloud. Run every minute from the
 * scheduler (withoutOverlapping). Each row is pushed independently so one bad
 * payload never blocks the rest. A row that exhausts its attempts is marked
 * failed and audited once; it stays in the table for manual review.
 */
class SyncPushCommand extends Command
{
    protected $signature = 'sync:push';

    protected $description = 'Push pending sync_outbox rows to the cloud';

    public function handle(): int
    {
        if (empty(config('sync.cloud_url'))) {
            $this->info('SYNC_CLOUD_URL not set — nothing to push (cloud instance).');

            return self::SUCCESS;
        }

        // Belt-and-braces with the scheduler's withoutOverlapping: a second
        // run inside the lock window just exits.
        $lock = cache()->lock('sync:push', 55);

        if (! $lock->get()) {
            $this->info('Another sync:push is already running.');

            return self::SUCCESS;
        }

        try {
            $batch = (int) config('sync.batch', 50);
            $rows = SyncOutbox::pending()->limit($batch)->get();

            if ($rows->isEmpty()) {
                return self::SUCCESS;
            }

            $pushed = 0;
            foreach ($rows as $row) {
                $row->increment('attempts');

                try {
                    $response = $this->postRow($row);

                    if ($response->successful() || $response->status() === 409) {
                        $row->update([
                            'status' => 'pushed',
                            'pushed_at' => now(),
                            'last_error' => null,
                        ]);
                        AuditLog::record('sync.pushed', null, [
                            'kind' => $row->kind,
                            'uuid' => $row->order_uuid,
                        ]);
                        $pushed++;
                        continue;
                    }

                    $this->markFailed($row, "HTTP {$response->status()}: {$response->body()}");
                } catch (\Throwable $e) {
                    $this->markFailed($row, $e->getMessage());
                }
            }

            $this->info("Pushed {$pushed} of {$rows->count()} rows.");

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }

    private function postRow(SyncOutbox $row)
    {
        $base = rtrim(config('sync.cloud_url'), '/');
        $timeout = (int) config('sync.timeout', 10);

        if ($row->kind === 'void') {
            return Http::withHeaders(['X-Sync-Secret' => config('sync.secret')])
                ->timeout($timeout)
                ->post("{$base}/api/sync/orders/{$row->order_uuid}/void");
        }

        // Order rows carry the full snapshot as their payload.
        return Http::withHeaders(['X-Sync-Secret' => config('sync.secret')])
            ->timeout($timeout)
            ->post("{$base}/api/sync/orders", $row->payload ?? []);
    }

    private function markFailed(SyncOutbox $row, string $error): void
    {
        $row->update(['last_error' => mb_substr($error, 0, 1000)]);

        // Exhausted — park it so the drainer stops retrying and audit the
        // final failure once rather than on every attempt.
        if ($row->attempts >= (int) config('sync.max_attempts', 5)) {
            $row->update(['status' => 'failed']);
            AuditLog::record('sync.failed', null, [
                'kind' => $row->kind,
                'uuid' => $row->order_uuid,
                'error' => $error,
            ]);
            Log::warning('sync row failed permanently', [
                'uuid' => $row->order_uuid,
                'error' => $error,
            ]);
        }
    }
}