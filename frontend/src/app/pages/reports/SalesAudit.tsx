import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadSalesAuditExport, useSalesAudit } from "@/app/api/reports";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatDate, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { SalesAuditRow } from "@/app/api/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function SalesAudit() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const canExport = isAdmin(user);

  const params: Record<string, unknown> = { page, per_page: 100 };
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading, isFetching, isError, refetch } = useSalesAudit(params);
  const tableLoading = isLoading || isFetching;
  const sums = data?.sums;

  const rows = data?.data ?? [];
  const perPage = data?.per_page ?? 100;
  const offset = ((data?.current_page ?? 1) - 1) * perPage;

  const applyRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadSalesAuditExport({ from, to });
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<SalesAuditRow>[] = [
    { key: "sn", header: "S/N", className: "w-16", cell: (_r, i) => i + 1 + offset },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    {
      key: "product_name",
      header: "Product Name",
      cell: (r) => <span className="font-medium">{r.product_name}</span>,
    },
    { key: "product_size", header: "Product Size", cell: (r) => r.product_size ?? "—" },
    { key: "opening", header: "Opening Stock", className: "text-right", cell: (r) => formatNumber(r.opening) },
    { key: "added", header: "Additional Stock", className: "text-right", cell: (r) => formatNumber(r.added) },
    { key: "cost_price", header: "Purchase Price", className: "text-right", cell: (r) => formatCurrency(r.cost_price) },
    { key: "selling_price", header: "Selling Price", className: "text-right", cell: (r) => formatCurrency(r.selling_price) },
    { key: "sold", header: "Daily Qty Sold", className: "text-right", cell: (r) => formatNumber(r.sold) },
    { key: "amount", header: "Amount", className: "text-right", cell: (r) => formatCurrency(r.amount) },
    { key: "closing", header: "Closing Stock", className: "text-right", cell: (r) => formatNumber(r.closing) },
    { key: "expire_date", header: "Products Expired date", cell: (r) => formatDate(r.expire_date) },
    { key: "user_name", header: "Name", cell: (r) => r.user_name ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Audit"
        description={
          sums && !tableLoading
            ? `${sums.count} ledger entr${sums.count === 1 ? "y" : "ies"} · ${formatNumber(sums.sold)} units sold`
            : "Per-product daily stock-ledger movement"
        }
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          ) : undefined
        }
      />

      <DateRangeFilter from={from} to={to} onApply={applyRange} />

      <DataTable
        columns={columns}
        data={rows}
        loading={tableLoading}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(r) => r.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        footer={
          tableLoading ? (
            <TableRow>
              <TableCell colSpan={13}>
                <Skeleton className="h-5 w-40" />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow className="font-semibold">
              <TableCell colSpan={9}>Total</TableCell>
              <TableCell className="text-right">{formatCurrency(sums?.amount)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          )
        }
      />
    </div>
  );
}