import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import {
  downloadProductTemplate,
  useImportProducts,
  useProducts,
} from "@/app/api/catalog";
import { Product } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { canManageProducts } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ProductList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { data, isLoading, isFetching, isError, refetch } = useProducts({
    search,
    page,
    per_page: perPage,
  });
  const importMutation = useImportProducts();
  const { user } = useAuth();
  const canManage = canManageProducts(user);
  const fileInput = useRef<HTMLInputElement>(null);

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
      key: "sn",
      header: "S/N",
      cell: (_p, index) => (data?.from ? data.from + index : index + 1),
    },
    {
      key: "name",
      header: "Name",
      cell: (p) => p.name,
    },
    {
      key: "size",
      header: "Size",
      cell: (p) => p.size ?? "—",
    },
    {
      key: "quantity",
      header: "Quantity",
      cell: (p) => formatNumber(p.quantity),
    },
    {
      key: "cost_price",
      header: "Cost Price",
      cell: (p) => formatCurrency(p.cost_price),
    },
    {
      key: "selling_price",
      header: "Selling Price",
      cell: (p) => formatCurrency(p.selling_price),
    },
    {
      key: "manufacture_date",
      header: "Manufactured Date",
      cell: (p) => p.manufacture_date ?? "—",
    },
    {
      key: "expire_date",
      header: "Expire Date",
      cell: (p) => p.expire_date ?? "—",
    },
    {
      key: "actions",
      header: "Action",
      cell: (p) => (
        <Button asChild variant="outline" size="sm" aria-label={`Edit ${p.name}`}>
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
        title="Product List"
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
                  <Download className="size-4" /> Download Template
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/products/new">
                <Plus className="size-4" /> Add New
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
        perPage={perPage}
        onPerPageChange={(n) => {
          setPerPage(n);
          setPage(1);
        }}
      />
    </div>
  );
}