import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { useDeleteCustomer, useSaveCustomer, useCustomers } from "@/app/api/customers";
import { Customer } from "@/app/api/types";
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

type Form = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

const EMPTY: Form = { name: "", phone: "", email: "", address: "" };

export default function CustomerList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useCustomers({ search, page });
  const saveMutation = useSaveCustomer();
  const deleteMutation = useDeleteCustomer();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? "",
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        address: editing.address ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    };

    saveMutation.mutate(
      { id: editing?.id, payload },
      {
        onSuccess: () => {
          toast.success(editing ? "Customer updated" : "Customer added");
          setOpen(false);
          setEditing(null);
        },
        onError: (err) => handleApiError(err),
      },
    );
  };

  const handleDelete = (c: Customer) => {
    deleteMutation.mutate(c.id, {
      onSuccess: () => toast.success("Customer deleted"),
      onError: (err) => handleApiError(err),
    });
  };

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    { key: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", cell: (c) => c.email ?? "—" },
    { key: "address", header: "Address", cell: (c) => c.address ?? "—" },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}>
            <Pencil className="size-4" />
          </Button>
          <ConfirmDelete
            itemName={c.name}
            onConfirm={() => handleDelete(c)}
            loading={deleteMutation.isPending}
          />
        </div>
      ),
    },
  ];

  const formValid = form.name.trim().length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Customer accounts for this tenant"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add Customer
          </Button>
        }
      />

      <Input
        placeholder="Search by name or phone…"
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
        rowKey={(c) => c.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        emptyMessage="No customers yet."
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle>
            <DialogDescription>Customer accounts can be attached to a sale in the POS.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="cust-name" className="text-sm font-medium">Name *</label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cust-phone" className="text-sm font-medium">Phone</label>
              <Input
                id="cust-phone"
                value={form.phone}
                onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cust-email" className="text-sm font-medium">Email</label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cust-address" className="text-sm font-medium">Address</label>
              <Textarea
                id="cust-address"
                rows={2}
                value={form.address}
                onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !formValid}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}