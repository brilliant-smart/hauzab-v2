import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { useLowStock } from "@/app/api/catalog";
import { Product } from "@/app/api/types";
import { formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";

export default function LowStock() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useLowStock({ page });

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
    {
      key: "quantity",
      header: "In Stock",
      cell: (p) => <span className="font-medium text-destructive">{formatNumber(p.quantity)}</span>,
    },
    { key: "reorder_level", header: "Reorder At", cell: (p) => formatNumber(p.reorder_level) },
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
        title="Product Reminder"
        description="Items at or below their reorder level"
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(p) => p.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        emptyMessage="Everything is above reorder level."
      />
    </div>
  );
}