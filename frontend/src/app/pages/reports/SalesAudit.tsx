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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesAuditRow } from "@/app/api/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function SalesAudit() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useSalesAudit({ from, to, page });
  const { user } = useAuth();
  const canExport = isAdmin(user);
  const tableLoading = isLoading || isFetching;

  const rows = data?.data ?? [];
  const perPage = data?.per_page ?? 0;
  const offset = ((data?.current_page ?? 1) - 1) * perPage;
  const pageAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0);

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
    { key: "sn", header: "S/N", cell: (_, idx) => idx + 1 + offset },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    { key: "product_name", header: "Product Name", cell: (r) => <span className="font-medium">{r.product_name}</span> },
    { key: "product_size", header: "Size", cell: (r) => r.product_size ?? "—" },
    { key: "opening", header: "Opening", cell: (r) => formatNumber(r.opening) },
    { key: "added", header: "Added", cell: (r) => formatNumber(r.added) },
    { key: "cost_price", header: "Cost Price", cell: (r) => formatCurrency(r.cost_price) },
    { key: "selling_price", header: "Selling Price", cell: (r) => formatCurrency(r.selling_price) },
    { key: "sold", header: "Qty Sold", cell: (r) => formatNumber(r.sold) },
    { key: "amount", header: "Amount", cell: (r) => formatCurrency(r.amount) },
    { key: "closing", header: "Closing", cell: (r) => formatNumber(r.closing) },
    { key: "expire_date", header: "Expire Date", cell: (r) => formatDate(r.expire_date) },
    { key: "user_name", header: "Staff", cell: (r) => r.user_name ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Audit"
        description="Per-product daily stock-ledger movement"
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
          <label htmlFor="sales-audit-from" className="text-sm font-medium">From</label>
          <Input id="sales-audit-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sales-audit-to" className="text-sm font-medium">To</label>
          <Input id="sales-audit-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="text-xs text-muted-foreground">Amount on this page</div>
          <div className="text-xl font-semibold">
            {tableLoading ? <Skeleton className="h-6 w-24" /> : formatCurrency(pageAmount)}
          </div>
        </CardContent>
      </Card>

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
      />
    </div>
  );
}