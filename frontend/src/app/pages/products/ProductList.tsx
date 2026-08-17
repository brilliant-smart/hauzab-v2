import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import {
  downloadProductTemplate,
  useDeleteProduct,
  useImportProducts,
  useProducts,
} from "@/app/api/catalog";
import { Product } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function ProductList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useProducts({ search, page });
  const deleteMutation = useDeleteProduct();
  const importMutation = useImportProducts();
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");
  const fileInput = useRef<HTMLInputElement>(null);

  const handleDelete = (product: Product) => {
    deleteMutation.mutate(product.id, {
      onSuccess: () => toast.success("Product deleted"),
      onError: (e) => handleApiError(e),
    });
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    importMutation.mutate(file, {
      onSuccess: (res) => {
        const summary = `Imported ${res.imported}, updated ${res.updated}, skipped ${res.skipped}.`;
        if (res.errors.length > 0) {
          toast.error(summary, { description: res.errors.slice(0, 5).join("\n") });
        } else {
          toast.success(summary);
        }
      },
      onError: (e) => handleApiError(e),
    });
  };

  const handleTemplate = async () => {
    try {
      await downloadProductTemplate();
    } catch (e) {
      handleApiError(e);
    }
  };

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="min-w-[160px]">
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">
            {[p.size, p.model].filter(Boolean).join(" · ") || p.barcode || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (p) => p.category?.name ?? "—",
    },
    {
      key: "quantity",
      header: "Stock",
      cell: (p) => (
        <span className={Number(p.quantity) <= p.reorder_level ? "font-medium text-destructive" : ""}>
          {formatNumber(p.quantity)}
        </span>
      ),
    },
    {
      key: "cost_price",
      header: "Cost",
      cell: (p) => formatCurrency(p.cost_price),
    },
    {
      key: "selling_price",
      header: "Selling",
      cell: (p) => formatCurrency(p.selling_price),
    },
    {
      key: "expire_date",
      header: "Expires",
      cell: (p) => (p.expire_date ? new Date(p.expire_date).toLocaleDateString("en-GB") : "—"),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) =>
        p.is_active ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={`Edit ${p.name}`}>
            <Link to={`/products/${p.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <ConfirmDelete
            itemName={p.name}
            onConfirm={() => handleDelete(p)}
            loading={deleteMutation.isPending}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product List"
        description="All stocked items for this branch"
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={importMutation.isPending}
                >
                  <Upload className="size-4" />
                  {importMutation.isPending ? "Importing…" : "Import"}
                </Button>
                <Button variant="ghost" onClick={handleTemplate}>
                  <Download className="size-4" /> Template
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/products/new">
                <Plus className="size-4" /> Add Product
              </Link>
            </Button>
          </div>
        }
      />

      <Input
        placeholder="Search by name, barcode or model…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
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
      />
    </div>
  );
}