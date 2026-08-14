<?php

// Campus→cloud sync. The campus server pushes its outbox to a cloud instance
// of this same codebase over a shared secret. Both sides read this config; the
// campus sets SYNC_CLOUD_URL, the cloud leaves it empty and only verifies the
// incoming secret.

return [
    // Cloud base URL the campus POSTs to. Empty on the cloud instance itself.
    'cloud_url' => env('SYNC_CLOUD_URL', ''),

    // Shared secret checked via X-Sync-Secret on both push and receive sides.
    'secret' => env('SYNC_SECRET', ''),

    // Give up on an outbox row after this many failed attempts.
    'max_attempts' => (int) env('SYNC_MAX_ATTEMPTS', 5),

    // Rows processed per sync:push run.
    'batch' => (int) env('SYNC_BATCH', 50),

    // Per-request HTTP timeout (seconds).
    'timeout' => (int) env('SYNC_TIMEOUT', 10),
];