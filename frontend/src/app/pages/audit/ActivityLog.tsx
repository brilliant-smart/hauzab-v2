import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuditLogs, downloadAuditLogExport } from "@/app/api/audit";
import { useAuth } from "@/app/auth/AuthContext";
import { isAdmin } from "@/app/auth/guards";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatDate } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuditLogEntry } from "@/app/api/types";

// Severity tiers — the colour reads as risk, not category, so a glance tells
// the owner whether an entry is routine or something to look at:
//   green  routine additions & healthy sign-ins
//   blue   neutral edits & sign-outs
//   amber  reversible money / security changes worth a look
//   red    destructive or security-sensitive events
type Tone = "success" | "info" | "warning" | "danger";

interface ActionMeta {
  label: string;
  tone: Tone;
}

const ACTION_META: Record<string, ActionMeta> = {
  // Sign-in & security
  "auth.login": { label: "Signed in", tone: "success" },
  "auth.logout": { label: "Signed out", tone: "info" },
  "auth.password-change": { label: "Password changed", tone: "warning" },
  "auth.password-reset": { label: "Password reset", tone: "danger" },

  // Products & stock
  "product.created": { label: "Product added", tone: "success" },
  "product.updated": { label: "Product updated", tone: "info" },
  "product.deleted": { label: "Product deleted", tone: "danger" },
  "product.imported": { label: "Products imported", tone: "success" },
  "consignment.created": { label: "Stock received", tone: "success" },
  "consignment.updated": { label: "Stock receipt updated", tone: "info" },
  "consignment.deleted": { label: "Stock receipt deleted", tone: "danger" },

  // Sales
  "order.created": { label: "Sale recorded", tone: "success" },
  "order.voided": { label: "Sale voided", tone: "warning" },

  // Expenses
  "expense.created": { label: "Expense added", tone: "success" },
  "expense.updated": { label: "Expense updated", tone: "info" },
  "expense.deleted": { label: "Expense deleted", tone: "danger" },
  "expense_category.created": { label: "Expense category added", tone: "success" },
  "expense_category.updated": { label: "Expense category updated", tone: "info" },
  "expense_category.deleted": { label: "Expense category deleted", tone: "danger" },

  // Staff & devices
  "user.created": { label: "Employee added", tone: "success" },
  "user.updated": { label: "Employee updated", tone: "info" },
  "device.created": { label: "Device added", tone: "success" },
  "device.updated": { label: "Device updated", tone: "info" },
  "device.deleted": { label: "Device removed", tone: "danger" },

  // Sync (offline-first sales arriving / leaving)
  "sync.received": { label: "Sale synced in", tone: "success" },
  "sync.pushed": { label: "Sale synced out", tone: "success" },
  "sync.voided": { label: "Void synced in", tone: "warning" },
  "sync.failed": { label: "Sync failed", tone: "danger" },
};

const TONE_BADGE: Record<Tone, BadgeVariant> = {
  success: "success",
  info: "info",
  warning: "warning",
  danger: "destructive",
};

const FILTER_GROUPS: { label: string; actions: string[] }[] = [
  {
    label: "Sign-in & security",
    actions: ["auth.login", "auth.logout", "auth.password-change", "auth.password-reset"],
  },
  {
    label: "Products & stock",
    actions: [
      "product.created",
      "product.updated",
      "product.deleted",
      "product.imported",
      "consignment.created",
      "consignment.updated",
      "consignment.deleted",
    ],
  },
  {
    label: "Sales",
    actions: ["order.created", "order.voided"],
  },
  {
    label: "Expenses",
    actions: [
      "expense.created",
      "expense.updated",
      "expense.deleted",
      "expense_category.created",
      "expense_category.updated",
      "expense_category.deleted",
    ],
  },
  {
    label: "Staff & devices",
    actions: ["user.created", "user.updated", "device.created", "device.updated", "device.deleted"],
  },
  {
    label: "Sync",
    actions: ["sync.received", "sync.pushed", "sync.voided", "sync.failed"],
  },
];

const NONE = "__all__";

function actionMeta(action: string): ActionMeta {
  // Unknown actions fall back to a neutral badge showing the raw code, so a
  // new backend event never renders as a blank.
  return ACTION_META[action] ?? { label: action, tone: "info" };
}

function shortSubject(type: string | null): string {
  if (!type) return "—";
  return type.split("\\").pop() ?? type;
}

export default function ActivityLog() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const canExport = isAdmin(user);
  const { data, isLoading, isFetching, isError, refetch } = useAuditLogs({
    search: search || undefined,
    action: action || undefined,
    page,
  });

  const handleExport = async () => {
    const params: Record<string, unknown> = {};
    if (search) params.search = search;
    if (action) params.action = action;
    setExporting(true);
    try {
      await downloadAuditLogExport(params);
      toast.success("Export ready");
    } catch (err) {
      handleApiError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Date / Time",
      cell: (r) => (
        <div className="min-w-[140px]">
          <div>{formatDate(r.created_at)}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleTimeString("en-GB")}
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (r) => {
        const meta = actionMeta(r.action);
        return (
          <Badge
            variant={TONE_BADGE[meta.tone]}
            title={r.action}
            className="whitespace-nowrap"
          >
            {meta.label}
          </Badge>
        );
      },
    },
    { key: "user", header: "User", cell: (r) => r.user?.name ?? "System" },
    {
      key: "subject",
      header: "Subject",
      cell: (r) =>
        r.subject_type ? `${shortSubject(r.subject_type)} #${r.subject_id ?? "—"}` : "—",
    },
    { key: "ip", header: "IP", cell: (r) => r.ip ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Log"
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download className="size-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="audit-search" className="text-sm font-medium">Search</label>
          <Input
            id="audit-search"
            placeholder="Action, subject or user…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="text-sm font-medium">Action</label>
          <Select
            value={action || NONE}
            onValueChange={(v) => { setAction(v === NONE ? "" : v); setPage(1); }}
          >
            <SelectTrigger id="audit-action" className="w-[220px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All actions</SelectItem>
              {FILTER_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionMeta(a).label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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