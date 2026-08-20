import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, AlertCircle, Inbox } from "lucide-react";
import { pageList } from "@/components/pagination";

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
  error?: boolean;
  onRetry?: () => void;
  rowKey: (row: T) => string | number;
  page?: number;
  lastPage?: number;
  total?: number;
  from?: number;
  to?: number;
  onPageChange?: (page: number) => void;
  perPage?: number;
  perPageOptions?: number[];
  onPerPageChange?: (perPage: number) => void;
  emptyMessage?: string;
  /** Optional total row rendered as a table footer (only when rows are shown). */
  footer?: ReactNode;
}

const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  rowKey,
  page,
  lastPage,
  total,
  from,
  to,
  onPageChange,
  perPage,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  onPerPageChange,
  emptyMessage = "No records found.",
  footer,
}: Props<T>) {
  return (
    <div className="space-y-3">
      {onPerPageChange && (
        <div className="flex items-center text-sm text-muted-foreground">
          <span className="mr-2">Show</span>
          <Select
            value={String(perPage ?? perPageOptions[0])}
            onValueChange={(v) => onPerPageChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perPageOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-2">entries</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
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
            {error ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 bg-destructive/5 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertCircle className="size-5 text-destructive" />
                    <span>Couldn't load this data.</span>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Retry
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="size-6 opacity-40" />
                    <span>{emptyMessage}</span>
                  </div>
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
          {footer && !error && !loading && data.length > 0 && (
            <TableFooter>{footer}</TableFooter>
          )}
        </Table>
      </div>

      {onPageChange && !error && !loading && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <span>
            {total != null && total > 0
              ? `Showing ${from ?? 0}–${to ?? 0} of ${total}`
              : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!page || page <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            {pageList(page ?? 1, lastPage ?? 1).map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  className="min-w-9"
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              ),
            )}
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