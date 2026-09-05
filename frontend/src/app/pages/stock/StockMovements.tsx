import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useStockMovements, downloadStockMovementsExport } from "@/app/api/stock";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatDate, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockMovement } from "@/app/api/types";

const TYPE_META: Record<string, { label: string; tone: BadgeVariant }> = {
  received: { label: "Received", tone: "success" },
  sale: { label: "Sale", tone: "info" },
  void: { label: "Void", tone: "info" },
  write_off: { label: "Write-off", tone: "warning" },
  count: { label: "Count", tone: "info" },
  transfer: { label: "Transfer", tone: "info" },
};

const NONE = "__all__";
const TYPES = ["received", "sale", "void", "write_off", "count", "transfer"];

function signed(value: string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return String(value);
  if (num === 0) return "0";
  return (num > 0 ? "+" : "") + formatNumber(num);
}

export default function StockMovements() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const canExport = isAdmin(user);

  const params: Record<string, unknown> = { page };
  if (search) params.search = search;
  if (type) params.type = type;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading, isFetching, isError, refetch } = useStockMovements(params);

  const handleExport = async () => {
    const exportParams: Record<string, unknown> = {};
    if (search) exportParams.search = search;
    if (type) exportParams.type = type;
    if (from) exportParams.from = from;
    if (to) exportParams.to = to;
    setExporting(true);
    try {
      await downloadStockMovementsExport(exportParams);
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<StockMovement>[] = [
    {
      key: "created_at",
      header: "Date / Time",
      cell: (r) => (
        <div className="min-w-[140px]">
          <div>{formatDate(r.created_at)}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleTimeString("en-GB")}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => {
        const meta = TYPE_META[r.type] ?? { label: r.type_label ?? r.type, tone: "info" as BadgeVariant };
        return <Badge variant={meta.tone} className="whitespace-nowrap">{meta.label}</Badge>;
      },
    },
    { key: "product", header: "Product", cell: (r) => r.product?.name ?? "—" },
    { key: "quantity_before", header: "Before", cell: (r) => formatNumber(r.quantity_before) },
    { key: "delta", header: "Delta", cell: (r) => signed(r.delta) },
    { key: "quantity_after", header: "After", cell: (r) => formatNumber(r.quantity_after) },
    { key: "reason", header: "Reason", cell: (r) => r.reason ?? "—" },
    { key: "note", header: "Note", cell: (r) => r.note ?? "—" },
    { key: "user", header: "User", cell: (r) => r.user?.name ?? "System" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Movements"
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="sm-search" className="text-sm font-medium">Search</label>
          <Input
            id="sm-search"
            placeholder="Product, reason or note…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sm-type" className="text-sm font-medium">Type</label>
          <Select value={type || NONE} onValueChange={(v) => { setType(v === NONE ? "" : v); setPage(1); }}>
            <SelectTrigger id="sm-type" className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_META[t]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sm-from" className="text-sm font-medium">From</label>
          <Input id="sm-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sm-to" className="text-sm font-medium">To</label>
          <Input id="sm-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(r) => r.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
      />
    </div>
  );
}