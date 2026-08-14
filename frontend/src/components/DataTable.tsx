import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (row: T) => string | number;
  page?: number;
  lastPage?: number;
  total?: number;
  from?: number;
  to?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  rowKey,
  page,
  lastPage,
  total,
  from,
  to,
  onPageChange,
  emptyMessage = "No records found.",
}: Props<T>) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell(row, index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {onPageChange && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total != null && total > 0
              ? `Showing ${from ?? 0}–${to ?? 0} of ${total}`
              : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!page || page <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <span>
              {page ?? 1} / {lastPage ?? 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!lastPage || page! >= lastPage!}
              onClick={() => onPageChange((page ?? 1) + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}