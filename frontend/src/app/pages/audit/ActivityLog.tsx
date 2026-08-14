import { useState } from "react";
import { useAuditLogs } from "@/app/api/audit";
import { formatDate } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AuditLogEntry } from "@/app/api/types";

const ACTIONS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "order.voided",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "expense_category.created",
  "expense_category.updated",
  "expense_category.deleted",
  "consignment.created",
  "consignment.updated",
  "consignment.deleted",
  "user.created",
  "user.updated",
];

const NONE = "__all__";

function shortSubject(type: string | null): string {
  if (!type) return "—";
  return type.split("\\").pop() ?? type;
}

export default function ActivityLog() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useAuditLogs({
    search: search || undefined,
    action: action || undefined,
    page,
  });

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
      cell: (r) => <Badge variant="secondary">{r.action}</Badge>,
    },
    { key: "user", header: "User", cell: (r) => r.user?.name ?? "System" },
    { key: "subject", header: "Subject", cell: (r) => `${shortSubject(r.subject_type)} #${r.subject_id ?? "—"}` },
    { key: "ip", header: "IP", cell: (r) => r.ip ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Activity Log" description="Append-only audit trail of changes" />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Search</label>
          <Input
            placeholder="Action, subject or user…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Action</label>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={action || NONE}
            onChange={(e) => { setAction(e.target.value === NONE ? "" : e.target.value); setPage(1); }}
          >
            <option value={NONE}>All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
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
    </div>
  );
}