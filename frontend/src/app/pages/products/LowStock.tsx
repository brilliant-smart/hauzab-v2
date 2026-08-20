import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import { useLowStock } from "@/app/api/catalog";
import { Product } from "@/app/api/types";
import { formatCurrency, formatDate, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";

export default function LowStock() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useLowStock({ page });

  const columns: Column<Product>[] = [
    { key: "sn", header: "S/N", className: "w-16", cell: (_p, i) => i + 1 },
    { key: "name", header: "Name", cell: (p) => p.name },
    { key: "size", header: "Size", cell: (p) => p.size ?? "—" },
    {
      key: "quantity",
      header: "Quantity",
      cell: (p) => (
        <span className="font-medium text-destructive">{formatNumber(p.quantity)}</span>
      ),
    },
    {
      key: "cost_price",
      header: "Cost Price",
      className: "text-right",
      cell: (p) => formatCurrency(p.cost_price),
    },
    {
      key: "selling_price",
      header: "Selling Price",
      className: "text-right",
      cell: (p) => formatCurrency(p.selling_price),
    },
    {
      key: "reorder_level",
      header: "Order Level",
      className: "text-right",
      cell: (p) => formatNumber(p.reorder_level),
    },
    {
      key: "manufacture_date",
      header: "Manufactured Date",
      cell: (p) => formatDate(p.manufacture_date),
    },
    {
      key: "expire_date",
      header: "Expire Date",
      cell: (p) => formatDate(p.expire_date),
    },
    {
      key: "actions",
      header: "Action",
      className: "text-right",
      cell: (p) => (
        <Button asChild variant="outline" size="sm">
          <Link to={`/products/${p.id}/edit`}>
            <Pencil className="size-4" /> Edit
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
        actions={
          <Button asChild>
            <Link to="/products/new">
              <Plus className="size-4" /> Add New
            </Link>
          </Button>
        }
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