import { useState } from "react";
import { Link } from "react-router-dom";
import { useSalesReport } from "@/app/api/reports";
import { formatCurrency, formatDate } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  completed: "secondary",
  credit: "default",
  voided: "destructive",
  pending: "outline",
};

export default function SalesReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useSalesReport({ from, to, page });
  const sumsLoading = isLoading || isFetching;

  return (
    <div className="space-y-4">
      <PageHeader title="Sales Report" description="Completed and credited sales for a date range" />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="sales-report-from" className="text-sm font-medium">From</label>
          <Input id="sales-report-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sales-report-to" className="text-sm font-medium">To</label>
          <Input id="sales-report-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <Button variant="outline" asChild>
          <Link to="/pos/history">Sales History</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Sales count</div>
            <div className="text-xl font-semibold">
              {sumsLoading ? <Skeleton className="h-6 w-16" /> : data?.sums.count ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Total sales</div>
            <div className="text-xl font-semibold">
              {sumsLoading ? <Skeleton className="h-6 w-24" /> : formatCurrency(data?.sums.total)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Amount paid</div>
            <div className="text-xl font-semibold">
              {sumsLoading ? <Skeleton className="h-6 w-24" /> : formatCurrency(data?.sums.amount_paid)}
            </div>
          </CardContent>
        </Card>
      </div>

      <SalesTable
        from={from}
        to={to}
        page={page}
        setPage={setPage}
        isLoading={isLoading || isFetching}
        isError={isError}
        onRetry={() => refetch()}
        data={data}
      />
    </div>
  );
}

interface SalesTableProps {
  from: string;
  to: string;
  page: number;
  setPage: (p: number) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  data: ReturnType<typeof useSalesReport>["data"];
}

function SalesTable({ page, setPage, isLoading, isError, onRetry, data }: SalesTableProps) {
  const orders = data?.data ?? [];
  const perPage = data?.per_page ?? 0;
  const offset = ((data?.current_page ?? 1) - 1) * perPage;

  const columns: Column<NonNullable<typeof data>["data"][number]>[] = [
    { key: "sn", header: "S/N", cell: (_, idx) => idx + 1 + offset },
    {
      key: "number",
      header: "Order ID",
      cell: (o) => (
        <Link to={`/pos/history/${o.id}`} className="font-medium text-primary hover:underline">
          {o.legacy_number ?? o.number}
        </Link>
      ),
    },
    { key: "customer", header: "Customer", cell: (o) => o.customer_name ?? "—" },
    { key: "user", header: "Cashier", cell: (o) => o.user?.name ?? "—" },
    { key: "items", header: "Items", cell: (o) => o.items.length },
    { key: "total", header: "Total", cell: (o) => formatCurrency(o.total) },
    { key: "amount_paid", header: "Paid", cell: (o) => formatCurrency(o.amount_paid) },
    {
      key: "status",
      header: "Status",
      cell: (o) => <Badge variant={STATUS_TONE[o.status.value] ?? "outline"}>{o.status.label}</Badge>,
    },
    { key: "date", header: "Date", cell: (o) => formatDate(o.created_at) },
  ];

  return (
    <DataTable
      columns={columns}
      data={orders}
      loading={isLoading}
      error={isError}
      onRetry={onRetry}
      rowKey={(o) => o.id}
      page={data?.current_page}
      lastPage={data?.last_page}
      total={data?.total}
      from={data?.from}
      to={data?.to}
      onPageChange={setPage}
    />
  );
}