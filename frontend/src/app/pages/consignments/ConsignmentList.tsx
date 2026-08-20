import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, Pencil, Plus } from "lucide-react";
import { useConsignments, useDeleteConsignment, downloadStockReceiptsExport } from "@/app/api/consignments";
import { Consignment } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatDate, formatNumber } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ConsignmentList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useConsignments({ search, page });
  const deleteMutation = useDeleteConsignment();
  const { user } = useAuth();
  const canMutate = isAdmin(user);

  const handleDelete = (row: Consignment) => {
    deleteMutation.mutate(row.id, {
      onSuccess: () => toast.success("Stock receipt deleted"),
      onError: (e) => handleApiError(e),
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadStockReceiptsExport(search ? { search } : {});
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const perPage = data?.per_page ?? 0;
  const offset = ((data?.current_page ?? 1) - 1) * perPage;

  const columns: Column<Consignment>[] = [
    { key: "sn", header: "S/N", cell: (_, idx) => idx + 1 + offset },
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div className="min-w-[160px]">
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {[r.model, r.size, r.barcode].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", cell: (r) => r.category ?? "—" },
    { key: "quantity", header: "Quantity", cell: (r) => formatNumber(r.quantity) },
    { key: "unit_cost", header: "Unit Cost", cell: (r) => formatCurrency(r.unit_cost) },
    { key: "unit_price", header: "Unit Price", cell: (r) => formatCurrency(r.unit_price) },
    { key: "unit_profit", header: "Profit", cell: (r) => formatCurrency(r.unit_profit) },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) =>
        canMutate ? (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link to={`/consignments/${row.id}/edit`}>
                <Pencil className="size-4" />
              </Link>
            </Button>
            <ConfirmDelete
              itemName={row.name}
              onConfirm={() => handleDelete(row)}
              loading={deleteMutation.isPending}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Receipts"
        description="Record of every batch received into stock"
        actions={
          canMutate ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}
              </Button>
              <Button asChild>
                <Link to="/consignments/new">
                  <Plus className="size-4" /> Add Stock Receipt
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <Input
        placeholder="Search by name, barcode or model…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
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