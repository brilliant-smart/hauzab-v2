import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import {
  useDeleteExpenseCategory,
  useExpenseCategories,
  useSaveExpenseCategory,
} from "@/app/api/expenses";
import { ExpenseCategory } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ExpenseCategories() {
  const { data, isLoading, isError, refetch } = useExpenseCategories();
  const saveMutation = useSaveExpenseCategory();
  const deleteMutation = useDeleteExpenseCategory();
  const { user } = useAuth();
  const canMutate = isAdmin(user);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
  }, [editing]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: ExpenseCategory) => {
    setEditing(row);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveMutation.mutate(
      {
        id: editing?.id,
        payload: { name, description: description || null },
      },
      {
        onSuccess: () => {
          toast.success(editing ? "Expense category updated" : "Expense category added");
          setOpen(false);
          setEditing(null);
        },
        onError: (err) => handleApiError(err),
      },
    );
  };

  const handleDelete = (row: ExpenseCategory) => {
    deleteMutation.mutate(row.id, {
      onSuccess: () => toast.success("Expense category deleted"),
      onError: (err) => handleApiError(err),
    });
  };

  const columns: Column<ExpenseCategory>[] = [
    { key: "name", header: "Category", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
    { key: "expenses_count", header: "Expenses", cell: (r) => r.expenses_count ?? 0 },
  ];

  const actionColumn: Column<ExpenseCategory> = {
    key: "actions",
    header: "",
    className: "text-right",
    cell: (row) =>
      canMutate ? (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Pencil className="size-4" />
          </Button>
          <ConfirmDelete
            itemName={row.name}
            onConfirm={() => handleDelete(row)}
            loading={deleteMutation.isPending}
          />
        </div>
      ) : null,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense Category"
        description="Group business expenses into categories"
        actions={
          canMutate ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add Category
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={[...columns, actionColumn]}
        data={data ?? []}
        loading={isLoading}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(r) => r.id}
        emptyMessage="No expense categories yet."
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense Category" : "Add Expense Category"}</DialogTitle>
            <DialogDescription>Group business expenses into categories</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="expense-category-name" className="text-sm font-medium">Name *</label>
              <Input
                id="expense-category-name"
                placeholder="Category name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="expense-category-description" className="text-sm font-medium">Description</label>
              <Textarea
                id="expense-category-description"
                rows={2}
                placeholder="Optional notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !name.trim()}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}