import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadStaffSalesExport, useStaffSales } from "@/app/api/reports";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { StaffSalesRow } from "@/app/api/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function StaffSales() {
  const { user } = useAuth();
  const canExport = isAdmin(user);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [exporting, setExporting] = useState(false);

  const params: Record<string, unknown> = {};
  if (from) params.from = from;
  if (to) params.to = to;

  const { data: rows, isLoading, isFetching, isError, refetch } = useStaffSales(params);
  const loading = isLoading || isFetching;

  const applyRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadStaffSalesExport({ from, to });
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const grandTotal = (rows ?? []).reduce((sum, r) => sum + Number(r.total), 0);
  const totalSales = (rows ?? []).reduce((sum, r) => sum + Number(r.sales_count), 0);

  const columns: Column<StaffSalesRow>[] = [
    { key: "sn", header: "S/N", className: "w-16", cell: (_r, i) => i + 1 },
    {
      key: "user_name",
      header: "Name",
      cell: (r) => <span className="font-medium">{r.user_name}</span>,
    },
    { key: "sales_count", header: "Sales", className: "text-right", cell: (r) => formatNumber(r.sales_count) },
    { key: "total", header: "Amount", className: "text-right", cell: (r) => formatCurrency(r.total) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Sales"
        description={
          rows && !loading
            ? `${rows.length} staff · ${formatNumber(totalSales)} sales`
            : "Sales grouped by staff member"
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
        data={rows ?? []}
        loading={loading}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(r) => r.user_id}
        emptyMessage="No sales in this range."
        footer={
          <TableRow className="font-semibold">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right">{formatNumber(totalSales)}</TableCell>
            <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
          </TableRow>
        }
      />
    </div>
  );
}