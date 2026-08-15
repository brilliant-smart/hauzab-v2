import { useState } from "react";
import { useStaffSales } from "@/app/api/reports";
import { formatCurrency, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { StaffSalesRow } from "@/app/api/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function StaffSales() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data, isLoading, isError, refetch } = useStaffSales({ from, to });

  const rows = data ?? [];
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

  const columns: Column<StaffSalesRow>[] = [
    { key: "sn", header: "S/N", cell: (_, idx) => idx + 1 },
    { key: "user_name", header: "Staff Name", cell: (r) => <span className="font-medium">{r.user_name}</span> },
    { key: "sales_count", header: "Sales Count", cell: (r) => formatNumber(r.sales_count) },
    { key: "total", header: "Amount", cell: (r) => formatCurrency(r.total) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Staff Sales" description="Sales grouped by staff member" />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(r) => r.user_id}
        emptyMessage="No sales in this range."
      />

      <div className="flex justify-end text-sm">
        <span className="font-medium">Total: {formatCurrency(grandTotal)}</span>
      </div>
    </div>
  );
}