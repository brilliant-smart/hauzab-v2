import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import {
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  useSaveExpense,
} from "@/app/api/expenses";
import { Expense } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency, formatDate } from "@/app/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export default function ExpenseList() {
  const [categoryId, setCategoryId] = useState<string>("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useExpenses({
    category_id: categoryId || undefined,
    page,
  });
  const categories = useExpenseCategories();
  const saveMutation = useSaveExpense();
  const deleteMutation = useDeleteExpense();
  const { user } = useAuth();
  const canMutate = isAdmin(user);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ expense_category_id: "", description: "", amount: "", date: "" });

  useEffect(() => {
    setForm({
      expense_category_id: editing?.expense_category_id ? String(editing.expense_category_id) : "",
      description: editing?.description ?? "",
      amount: editing ? String(editing.amount) : "",
      date: editing?.date ?? new Date().toISOString().slice(0, 10),
    });
  }, [editing]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: Expense) => {
    setEditing(row);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(
      {
        id: editing?.id,
        payload: {
          expense_category_id: form.expense_category_id && form.expense_category_id !== NONE
            ? Number(form.expense_category_id)
            : null,
          description: form.description,
          amount: Number(form.amount),
          date: form.date,
        },
      },
      {
        onSuccess: () => {
          toast.success(editing ? "Expense updated" : "Expense added");
          setOpen(false);
          setEditing(null);
        },
        onError: (err) => handleApiError(err),
      },
    );
  };

  const handleDelete = (row: Expense) => {
    deleteMutation.mutate(row.id, {
      onSuccess: () => toast.success("Expense deleted"),
      onError: (err) => handleApiError(err),
    });
  };

  const columns: Column<Expense>[] = [
    {
      key: "sn",
      header: "S/N",
      cell: (_, idx) => idx + 1 + ((data?.current_page ?? 1) - 1) * (data?.per_page ?? 0),
    },
    { key: "category", header: "Category", cell: (r) => r.category?.name ?? "—" },
    { key: "description", header: "Expense", cell: (r) => r.description },
    { key: "amount", header: "Amount", cell: (r) => formatCurrency(r.amount) },
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    {
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
              itemName={row.description}
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
        title="Expense List"
        description="Record and review business expenses"
        actions={
          canMutate ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add Expense
            </Button>
          ) : undefined
        }
      />

      <div className="max-w-xs">
        <Select
          value={categoryId || NONE}
          onValueChange={(v) => {
            setCategoryId(v === NONE ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All categories</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        rowKey={(r) => r.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>Record a business expense</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={form.expense_category_id || NONE}
                onValueChange={(v) => setForm((s) => ({ ...s, expense_category_id: v === NONE ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorized</SelectItem>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                rows={2}
                placeholder="What was the expense for?"
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount *</label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date *</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}