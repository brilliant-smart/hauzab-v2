import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { useBranches } from "@/app/api/branches";
import { useDeleteDevice, useDevices, useSaveDevice } from "@/app/api/devices";
import { Device } from "@/app/api/types";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

type Form = {
  name: string;
  branch_id: string; // "" = no branch
  is_active: boolean;
};

const EMPTY: Form = { name: "", branch_id: "", is_active: true };

export default function DeviceList() {
  const { data, isLoading, isError, refetch } = useDevices();
  const { data: branches } = useBranches();
  const saveMutation = useSaveDevice();
  const deleteMutation = useDeleteDevice();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? "",
        branch_id: editing.branch_id ? String(editing.branch_id) : "",
        is_active: editing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      is_active: form.is_active,
    };

    saveMutation.mutate(
      { id: editing?.id, payload },
      {
        onSuccess: () => {
          toast.success(editing ? "Device updated" : "Device added");
          setOpen(false);
          setEditing(null);
        },
        onError: (err) => handleApiError(err),
      },
    );
  };

  const handleDelete = (d: Device) => {
    deleteMutation.mutate(d.id, {
      onSuccess: () => toast.success("Device deleted"),
      onError: (err) => handleApiError(err),
    });
  };

  const columns: Column<Device>[] = [
    {
      key: "name",
      header: "Device",
      cell: (d) => <span className="font-medium">{d.name}</span>,
    },
    { key: "branch", header: "Branch", cell: (d) => d.branch?.name ?? "—" },
    {
      key: "last_seen_at",
      header: "Last seen",
      cell: (d) =>
        d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("en-GB") : "Never",
    },
    {
      key: "status",
      header: "Status",
      cell: (d) =>
        d.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label={`Edit ${d.name}`} onClick={() => openEdit(d)}>
            <Pencil className="size-4" />
          </Button>
          <ConfirmDelete
            itemName={d.name}
            message="This will remove the device record from this tenant."
            onConfirm={() => handleDelete(d)}
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
        title="Devices"
        description="Tills and tablets registered to this tenant"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add Device
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(d) => d.id}
        emptyMessage="No devices registered yet."
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Device" : "Add Device"}</DialogTitle>
            <DialogDescription>Register a till or tablet so its sales can be attributed.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="device-name" className="text-sm font-medium">Name *</label>
              <Input
                id="device-name"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="device-branch" className="text-sm font-medium">Branch</label>
              <Select
                value={form.branch_id || "none"}
                onValueChange={(v) => setForm((s) => ({ ...s, branch_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger id="device-branch">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {branches?.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="device-active" className="text-sm font-medium">Active</label>
              <Switch
                id="device-active"
                checked={form.is_active}
                onCheckedChange={(c) => setForm((s) => ({ ...s, is_active: c }))}
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