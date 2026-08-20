import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadSalesReportExport, useSalesReport } from "@/app/api/reports";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { Order } from "@/app/api/types";
import { formatCurrency, formatDate } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  completed: "secondary",
  credit: "default",
  voided: "destructive",
  pending: "outline",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function SalesReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const canExport = isAdmin(user);

  const params: Record<string, unknown> = { page, per_page: 25 };
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading, isFetching, isError, refetch } = useSalesReport(params);
  const sumsLoading = isLoading || isFetching;
  const sums = data?.sums;

  const applyRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadSalesReportExport({ from, to });
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const orders = data?.data ?? [];
  const perPage = data?.per_page ?? 25;
  const offset = ((data?.current_page ?? 1) - 1) * perPage;

  const columns: Column<Order>[] = [
    { key: "sn", header: "S/N", className: "w-16", cell: (_o, i) => i + 1 + offset },
    {
      key: "number",
      header: "Order ID",
      cell: (o) => (
        <Link to={`/pos/history/${o.id}`} className="font-medium text-primary hover:underline">
          {o.legacy_number ?? o.number}
        </Link>
      ),
    },
    { key: "total", header: "Total", className: "text-right", cell: (o) => formatCurrency(o.total) },
    {
      key: "amount_paid",
      header: "Amount Paid",
      className: "text-right",
      cell: (o) => formatCurrency(o.amount_paid),
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => <Badge variant={STATUS_TONE[o.status.value] ?? "outline"}>{o.status.label}</Badge>,
    },
    { key: "user", header: "Sales Person", cell: (o) => o.user?.name ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Report"
        description={
          sums && !sumsLoading
            ? `${sums.count} sale${sums.count === 1 ? "" : "s"} · ${formatDate(from)} to ${formatDate(to)}`
            : "Completed and credited sales for a date range"
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
        data={orders}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(o) => o.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        footer={
          sumsLoading ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Skeleton className="h-5 w-40" />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right">{formatCurrency(sums?.total)}</TableCell>
              <TableCell className="text-right">{formatCurrency(sums?.amount_paid)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )
        }
      />
    </div>
  );
}