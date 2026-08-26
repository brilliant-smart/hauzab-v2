<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\StreamsExports;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class AuditLogController extends Controller
{
    use StreamsExports;

    public function index(Request $request)
    {
        $logs = AuditLog::query()
            ->with(['user'])
            ->when($request->filled('action'), fn ($q) => $q->where('action', $request->string('action')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('action', 'like', "%{$term}%")
                    ->orWhere('subject_type', 'like', "%{$term}%")
                    ->orWhere('subject_name', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%")));
            })
            ->latest('created_at')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString()
            ->through(fn ($log) => array_merge($log->toArray(), [
                'label' => AuditLog::label($log->action),
                'changes' => $this->formatChanges($log->properties),
            ]));

        return response()->json($logs);
    }

    /**
     * Render an audit row's structured properties as a single human "before → after"
     * cell. Tolerant of the shapes the controllers actually write:
     *  - ['fields' => [field => ['before' => ..., 'after' => ...], ...]] (product edits)
     *  - ['before' => ..., 'after' => ...]
     *  - a flat key/value context payload (scalars only; arrays skipped).
     */
    private function formatChanges(?array $properties): string
    {
        if (! $properties) {
            return '—';
        }

        if (isset($properties['fields']) && is_array($properties['fields'])) {
            $lines = [];
            foreach ($properties['fields'] as $field => $change) {
                if (is_array($change)) {
                    $before = $change['before'] ?? $change['from'] ?? '—';
                    $after = $change['after'] ?? $change['to'] ?? '—';
                    $lines[] = "{$field}: {$before} → {$after}";
                } else {
                    $lines[] = "{$field}: {$change}";
                }
            }

            return $lines ? implode('; ', $lines) : '—';
        }

        if (array_key_exists('before', $properties) || array_key_exists('after', $properties)) {
            $before = $properties['before'] ?? '—';
            $after = $properties['after'] ?? '—';

            return "{$before} → {$after}";
        }

        $lines = [];
        foreach ($properties as $key => $value) {
            if (is_scalar($value)) {
                $lines[] = "{$key}: {$value}";
            }
        }

        return $lines ? implode('; ', $lines) : '—';
    }

    /** Activity log export to .xlsx — honours the same search/action filters (admin only). */
    public function export(Request $request)
    {
        $this->prepareExport();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Date', 'Time', 'Action', 'User', 'Product/Subject', 'Description', 'Changes (before → after)', 'IP'];
        $sheet->fromArray([$headers], null, 'A1');

        $row = 2;
        $widths = array_map('strlen', $headers);

        $logs = AuditLog::query()
            ->with(['user'])
            ->when($request->filled('action'), fn ($q) => $q->where('action', $request->string('action')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(fn ($inner) => $inner
                    ->where('action', 'like', "%{$term}%")
                    ->orWhere('subject_type', 'like', "%{$term}%")
                    ->orWhere('subject_name', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%")));
            })
            ->latest('created_at')
            ->cursor();

        foreach ($logs as $log) {
            $subject = $log->subject_name
                ?? ($log->subject_type
                    ? class_basename($log->subject_type).' #'.($log->subject_id ?? '—')
                    : '—');
            $cells = [
                $log->created_at ? date('Y-m-d', strtotime($log->created_at)) : '—',
                $log->created_at ? date('H:i', strtotime($log->created_at)) : '—',
                AuditLog::label($log->action),
                $log->user?->name ?? 'System',
                $subject,
                $log->description ?? '—',
                $this->formatChanges($log->properties),
                $log->ip ?? '—',
            ];
            $this->trackWidths($widths, $cells);
            $sheet->fromArray([$cells], null, "A{$row}");
            $row++;
        }

        $this->styleSheet($sheet, $headers, [], $widths);

        return $this->streamSpreadsheet($spreadsheet, $this->exportName('activity-log', null, null));
    }
}