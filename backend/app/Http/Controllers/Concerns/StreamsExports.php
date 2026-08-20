<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Shared .xlsx export helpers: a bold frozen header row, an auto-filter,
 * explicit character-width columns sized to the widest cell so headers never
 * truncate, and a thousands-separated number format on nominated currency
 * columns. Streams the finished file as a download and cleans up after.
 *
 * Widths are tracked while rows are written (trackWidths) and applied once at
 * the end (styleSheet) rather than via setAutoSize(true) — the latter runs
 * PhpSpreadsheet's font-metric estimator over every cell, which is O(rows ×
 * cols) and times out on multi-thousand-row exports.
 */
trait StreamsExports
{
    /**
     * Keep $widths (0-indexed, per column) up to date with the widest cell value
     * seen so far. Call per row while streaming so columns can be sized once at
     * the end without re-reading the sheet.
     */
    protected function trackWidths(array &$widths, array $cells): void
    {
        foreach ($cells as $i => $val) {
            $len = strlen((string) $val);
            if ($len > ($widths[$i] ?? 0)) {
                $widths[$i] = $len;
            }
        }
    }

    /**
     * Apply the shared styling: bold + frozen header row, an auto-filter over
     * the table, explicit character-width columns sized to the header and the
     * widest cell (so headers never truncate), a thousands-separated number
     * format on the given currency columns so Excel treats them as sum-able
     * numbers, and a Text (@) format on the given text columns so long numeric
     * identifiers (barcodes, account numbers) don't collapse to scientific
     * notation and leading zeros survive. The values in text columns must also
     * be written as explicit string cells (see writeTextCell) — a @ format alone
     * won't stop a numeric-looking string from being bound as a number during
     * fromArray. Call after all data rows are written.
     */
    protected function styleSheet(Worksheet $sheet, array $headers, array $currencyCols = [], array $widths = [], array $textCols = []): void
    {
        $lastCol = count($headers);
        $lastColLetter = Coordinate::stringFromColumnIndex($lastCol);

        $sheet->getStyle("A1:{$lastColLetter}1")->applyFromArray(['font' => ['bold' => true]]);
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:{$lastColLetter}1");

        for ($i = 0; $i < $lastCol; $i++) {
            $letter = Coordinate::stringFromColumnIndex($i + 1);
            // Width is in character units; pad for cell margins, floor at 10,
            // cap at 55 so a very long name doesn't stretch the sheet.
            $width = min(max(($widths[$i] ?? strlen($headers[$i])) + 2, 10), 55);
            $sheet->getColumnDimension($letter)->setWidth($width);
        }

        $lastRow = $sheet->getHighestDataRow();
        if ($lastRow >= 2) {
            foreach ($currencyCols as $col) {
                $letter = Coordinate::stringFromColumnIndex($col);
                $sheet->getStyle("{$letter}2:{$letter}{$lastRow}")
                    ->getNumberFormat()
                    ->setFormatCode('#,##0.00');
            }
            foreach ($textCols as $col) {
                $letter = Coordinate::stringFromColumnIndex($col);
                $sheet->getStyle("{$letter}2:{$letter}{$lastRow}")
                    ->getNumberFormat()
                    ->setFormatCode('@');
            }
        }
    }

    /**
     * Write a value as an explicit Text cell (TYPE_STRING). Use for identifier
     * columns such as barcodes: fromArray binds numeric-looking strings as
     * numbers, which makes Excel render long barcodes as scientific notation
     * (6.9311E+12) and drops leading zeros. Pair with a textCols entry in
     * styleSheet so the column is also marked Text (@).
     */
    protected function writeTextCell(Worksheet $sheet, string $coord, ?string $value): void
    {
        $sheet->setCellValueExplicit($coord, (string) ($value ?? ''), DataType::TYPE_STRING);
    }

    /**
     * Exports stream thousands of rows into an in-memory spreadsheet and may run
     * well past the 30s request limit on a large range. Reset the timer and raise
     * the per-request memory ceiling so the export can finish rather than dying
     * mid-file. Safe on any request — these are dev/perf ceilings, not security
     * limits, and apply only to this PHP process.
     */
    protected function prepareExport(): void
    {
        if (! in_array(PHP_SAPI, ['cli', 'phpdbg'], true)) {
            set_time_limit(0);
        }
        ini_set('memory_limit', '1024M');
    }

    /** Write the spreadsheet to a temp file and stream it as a download, cleaning up after. */
    protected function streamSpreadsheet(Spreadsheet $spreadsheet, string $fileName)
    {
        $temp = tempnam(sys_get_temp_dir(), 'exp') . '.xlsx';
        (new Xlsx($spreadsheet))->save($temp);

        return response()->download($temp, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    /**
     * Build a range-aware export filename. A ranged export carries its window
     * (sales-report-2026-08-01-to-2026-08-19.xlsx); an un-ranged export keeps
     * its "all-time" label and is stamped with the day it was generated
     * (sales-report-all-time-2026-08-20.xlsx) so repeated downloads don't all
     * land as ...-all-time.xlsx and overwrite each other, while staying
     * distinct from a same-day single-day range (...-08-20-to-08-20.xlsx).
     */
    protected function exportName(string $base, ?Carbon $from, ?Carbon $to): string
    {
        $label = $from && $to
            ? "{$from->toDateString()}-to-{$to->toDateString()}"
            : 'all-time-' . Carbon::today()->toDateString();

        return "{$base}-{$label}.xlsx";
    }
}