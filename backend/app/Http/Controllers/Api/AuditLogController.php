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
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%")));
            })
            ->latest('created_at')
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return response()->json($logs);
    }

    /** Activity log export to .xlsx — honours the same search/action filters (admin only). */
    public function export(Request $request)
    {
        $this->prepareExport();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $headers = ['Date', 'Time', 'Action', 'User', 'Subject', 'IP'];
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
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$term}%")));
            })
            ->latest('created_at')
            ->cursor();

        foreach ($logs as $log) {
            $subject = $log->subject_type
                ? class_basename($log->subject_type).' #'.($log->subject_id ?? '—')
                : '—';
            $cells = [
                $log->created_at ? date('Y-m-d', strtotime($log->created_at)) : '—',
                $log->created_at ? date('H:i', strtotime($log->created_at)) : '—',
                AuditLog::label($log->action),
                $log->user?->name ?? 'System',
                $subject,
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