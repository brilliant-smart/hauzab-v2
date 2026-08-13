import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { useExpiring } from "@/app/api/catalog";
import { Product } from "@/app/api/types";
import { formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Expiring() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useExpiring({ page });

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">{p.category?.name ?? "—"}</div>
        </div>
      ),
    },
    { key: "unit", header: "Unit", cell: (p) => p.unit?.name ?? "—" },
    { key: "quantity", header: "Stock", cell: (p) => formatNumber(p.quantity) },
    {
      key: "expire_date",
      header: "Expires",
      cell: (p) => {
        const days = daysUntil(p.expire_date);
        const overdue = days != null && days < 0;
        const soon = days != null && days <= 30;
        return (
          <span className={overdue ? "text-destructive" : soon ? "text-amber-600" : ""}>
            {new Date(p.expire_date!).toLocaleDateString("en-GB")}
            {days != null && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({overdue ? `${Math.abs(days)}d over` : `${days}d left`})
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (p) => (
        <Button asChild variant="ghost" size="icon">
          <Link to={`/products/${p.id}/edit`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expired Product"
        description="Items expiring within 90 days"
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        rowKey={(p) => p.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        emptyMessage="No products expiring soon."
      />
    </div>
  );
}