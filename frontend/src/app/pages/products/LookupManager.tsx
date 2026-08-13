import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import {
  LookupKey,
  useDeleteLookup,
  useLookupList,
  useSaveLookup,
} from "@/app/api/catalog";
import { ContactResource, NamedResource } from "@/app/api/types";
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

type Row = NamedResource & Partial<ContactResource>;

export interface LookupField {
  name: keyof Row;
  label: string;
  type?: "text" | "email" | "textarea";
  required?: boolean;
  placeholder?: string;
}

export interface LookupConfig {
  resource: LookupKey;
  title: string;
  description: string;
  itemNoun: string;
  fields: LookupField[];
  columns: Column<Row>[];
}

export default function LookupManager({ config }: { config: LookupConfig }) {
  const { resource, title, description, itemNoun, fields, columns } = config;
  const { data, isLoading } = useLookupList<Row>(resource);
  const saveMutation = useSaveLookup(resource);
  const deleteMutation = useDeleteLookup(resource);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) {
      setForm(
        Object.fromEntries(fields.map((f) => [f.name, String((editing as Row)[f.name] ?? "")])),
      );
    } else {
      setForm(Object.fromEntries(fields.map((f) => [f.name, ""])));
    }
  }, [editing, fields]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    // Send null for empty optional fields instead of empty strings.
    fields.forEach((f) => {
      if (!f.required && payload[f.name as string] === "") payload[f.name as string] = null;
    });

    saveMutation.mutate(
      { id: editing?.id, payload },
      {
        onSuccess: () => {
          toast.success(editing ? `${itemNoun} updated` : `${itemNoun} added`);
          setOpen(false);
          setEditing(null);
        },
        onError: (err) => handleApiError(err),
      },
    );
  };

  const handleDelete = (row: Row) => {
    deleteMutation.mutate(row.id, {
      onSuccess: () => toast.success(`${itemNoun} deleted`),
      onError: (err) => handleApiError(err),
    });
  };

  const actionColumn: Column<Row> = {
    key: "actions",
    header: "",
    className: "text-right",
    cell: (row) => (
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
    ),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add {itemNoun}
          </Button>
        }
      />

      <DataTable
        columns={[...columns, actionColumn]}
        data={data ?? []}
        loading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage={`No ${itemNoun.toLowerCase()}s yet.`}
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${itemNoun}` : `Add ${itemNoun}`}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((f) => (
              <div key={f.name as string} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {f.label}{f.required ? " *" : ""}
                </label>
                {f.type === "textarea" ? (
                  <Textarea
                    rows={2}
                    placeholder={f.placeholder}
                    value={form[f.name as string] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name as string]: e.target.value }))}
                  />
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    placeholder={f.placeholder}
                    value={form[f.name as string] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name as string]: e.target.value }))}
                  />
                )}
              </div>
            ))}
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