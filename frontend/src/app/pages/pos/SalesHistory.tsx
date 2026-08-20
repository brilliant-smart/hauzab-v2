import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Coins, Download, Filter } from "lucide-react";
import { useOrders } from "@/app/api/orders";
import { downloadSalesHistoryExport } from "@/app/api/reports";
import { Order } from "@/app/api/types";
import { useOutbox } from "@/app/offline/useOutbox";
import type { OutboxEntry } from "@/app/offline/outboxDb";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin, isAtLeast } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatDate, formatNumber } from "@/app/lib/format";
import { cn } from "@/lib/utils";
import { pageList } from "@/components/pagination";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// One line under an order's group header.
interface HistoryLine {
  name: string;
  quantity: number;
  price: number; // line total
}

// One order (server or offline-pending) rendered as a group of lines.
interface HistoryGroup {
  key: string;
  id: number | null;
  number: string;
  total: number;
  date: string;
  cashier?: string | null;
  voided: boolean;
  pending: boolean;
  lines: HistoryLine[];
}

type RenderRow =
  | { type: "group"; group: HistoryGroup }
  | { type: "line"; group: HistoryGroup; line: HistoryLine; sn: number };

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function today(): string {
  return toISO(new Date());
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

// Which quick preset matches the currently applied range, for chip highlight.
function presetOf(from: string, to: string): string | null {
  if (!from && !to) return "all";
  const t = today();
  if (from === t && to === t) return "today";
  const y = daysAgo(1);
  if (from === y && to === y) return "yesterday";
  if (from === daysAgo(6) && to === t) return "7d";
  if (from === daysAgo(29) && to === t) return "30d";
  return null;
}

const PRESETS: { key: string; label: string; from: string; to: string }[] = [
  { key: "today", label: "Today", from: today(), to: today() },
  { key: "yesterday", label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
  { key: "7d", label: "7 Days", from: daysAgo(6), to: today() },
  { key: "30d", label: "30 Days", from: daysAgo(29), to: today() },
  { key: "all", label: "All Time", from: "", to: "" },
];

function orderToGroup(o: Order): HistoryGroup {
  return {
    key: o.uuid,
    id: o.id,
    number: o.number,
    total: Number(o.total),
    date: o.created_at ?? "",
    cashier: o.user?.name ?? null,
    voided: o.status.value === "voided",
    pending: false,
    lines: o.items.map((i) => ({
      name: i.product_name,
      quantity: Number(i.quantity),
      price: Number(i.line_total),
    })),
  };
}

function outboxToGroup(e: OutboxEntry): HistoryGroup {
  const subtotal = e.payload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const total = Math.max(0, subtotal - (e.payload.discount ?? 0));
  return {
    key: e.uuid,
    id: null,
    number: "OFFLINE-" + e.uuid.slice(0, 8).toUpperCase(),
    total,
    date: new Date(e.created_at).toISOString(),
    cashier: null,
    voided: false,
    pending: true,
    lines: e.payload.items.map((i) => ({
      name: i.product_name ?? `Product #${i.product_id}`,
      quantity: i.quantity,
      price: i.quantity * i.unit_price,
    })),
  };
}

export default function SalesHistory() {
  const { user } = useAuth();
  const canSeeAll = isAtLeast(user, "supervisor");
  const canExport = isAdmin(user);
  const navigate = useNavigate();
  const outbox = useOutbox();

  // Applied (filtered) range drives the fetch; the date pickers hold a draft
  // that only becomes applied on Filter.
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [fromInput, setFromInput] = useState(today());
  const [toInput, setToInput] = useState(today());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [exporting, setExporting] = useState(false);

  const params: Record<string, unknown> = { search, page, per_page: perPage };
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading, isFetching, isError, refetch } = useOrders(params);

  const serverOrders = data?.data ?? [];
  const serverUuids = useMemo(() => new Set(serverOrders.map((o) => o.uuid)), [serverOrders]);

  // Pending/failed outbox sales, deduped against the current page of server
  // orders (a synced sale's server row supersedes its provisional row).
  const pendingGroups = useMemo(
    () =>
      (outbox.all ?? [])
        .filter((e) => e.status === "pending" || e.status === "failed")
        .filter((e) => !serverUuids.has(e.uuid))
        .map(outboxToGroup)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [outbox.all, serverUuids],
  );

  const groups = useMemo<HistoryGroup[]>(
    () => [...pendingGroups, ...serverOrders.map(orderToGroup)],
    [pendingGroups, serverOrders],
  );

  // Flatten into group-header + line rows, assign running S/N, and total the
  // non-voided order totals (voided sales are excluded from the grand total).
  const { rows, grandTotal } = useMemo(() => {
    const out: RenderRow[] = [];
    let sn = 0;
    let total = 0;
    for (const g of groups) {
      out.push({ type: "group", group: g });
      for (const line of g.lines) {
        sn += 1;
        out.push({ type: "line", group: g, line, sn });
      }
      if (!g.voided) total += g.total;
    }
    return { rows: out, grandTotal: total };
  }, [groups]);

  const activePreset = presetOf(from, to);
  const pendingCount = pendingGroups.length;

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setFrom(p.from);
    setTo(p.to);
    setFromInput(p.from);
    setToInput(p.to);
    setPage(1);
  };

  const runFilter = () => {
    if (!fromInput || !toInput) {
      toast.error("Fill Date correctly");
      return;
    }
    setFrom(fromInput);
    setTo(toInput);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadSalesHistoryExport({ from, to });
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Coins className="size-5" /> Sales History
          </span>
        }
        description={canSeeAll ? "All register sales" : "Your sales for this shift"}
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          ) : undefined
        }
      />

      {pendingCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
          {pendingCount} sale{pendingCount === 1 ? "" : "s"} pending sync — they’ll be sent to the server when connectivity returns.
        </div>
      )}

      {/* Filter bar — From/To date pickers + Filter with quick presets. */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <DatePicker value={fromInput} onChange={setFromInput} className="w-44" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <DatePicker value={toInput} onChange={setToInput} className="w-44" />
          </div>
          <Button type="button" onClick={runFilter}>
            <Filter className="size-4" /> Filter
          </Button>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input
                placeholder="Order # or customer…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-56"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick:</span>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant={activePreset === p.key ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">S/N</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="w-28 text-right">Quantity</TableHead>
              <TableHead className="w-32 text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Couldn’t load sales.{" "}
                  <Button variant="link" className="h-auto p-0" onClick={() => refetch()}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : isLoading || isFetching ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No sales in this range.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) =>
                row.type === "group" ? (
                  <TableRow
                    key={`g-${row.group.key}`}
                    className="bg-muted/60 hover:bg-muted/60"
                  >
                    <TableCell colSpan={4} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.group.pending ? (
                            <Badge variant="warning">Pending sync</Badge>
                          ) : row.group.voided ? (
                            <Badge variant="destructive">Voided</Badge>
                          ) : null}
                          <button
                            type="button"
                            disabled={row.group.pending || row.group.voided}
                            onClick={() =>
                              row.group.id && navigate(`/pos/history/${row.group.id}`)
                            }
                            className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-100 disabled:no-underline"
                          >
                            {row.group.number}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {row.group.date ? formatDate(row.group.date) : ""}
                            {row.group.cashier ? ` · ${row.group.cashier}` : ""}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-semibold",
                            row.group.voided && "text-muted-foreground line-through",
                          )}
                        >
                          {formatCurrency(row.group.total)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow
                    key={`l-${row.group.key}-${i}`}
                    className={cn(row.group.voided && "text-muted-foreground")}
                  >
                    <TableCell>{row.sn}</TableCell>
                    <TableCell className={cn(row.group.voided && "line-through")}>
                      {row.line.name}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(row.line.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.line.price)}
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
          {rows.length > 0 && !isError && !(isLoading || isFetching) && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={3} className="text-right">
                  Total
                </TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Per-order pagination (the API paginates by order, not line item). */}
      {data && !isError && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <div className="flex items-center">
            <span className="mr-2">Show</span>
            <select
              className="h-8 rounded-md border bg-background px-2"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="ml-2">
              {data.total != null && data.total > 0
                ? `Showing ${data.from ?? 0}–${data.to ?? 0} of ${data.total} orders`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.current_page || data.current_page <= 1}
              onClick={() => setPage((data.current_page ?? 1) - 1)}
            >
              Prev
            </Button>
            {pageList(data.current_page ?? 1, data.last_page ?? 1).map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === data.current_page ? "default" : "outline"}
                  size="sm"
                  className="min-w-9"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!data.last_page || (data.current_page ?? 1) >= (data.last_page ?? 1)}
              onClick={() => setPage((data.current_page ?? 1) + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}