import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { useOrders } from "@/app/api/orders";
import { Order, OrderStatusValue, PaymentMethodValue } from "@/app/api/types";
import { useOutbox } from "@/app/offline/useOutbox";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { formatCurrency, formatDate } from "@/app/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SalesStatus = OrderStatusValue | "pending_sync" | "sync_failed";

interface SalesRow {
  id: number | null;
  uuid: string;
  number: string;
  created_at: string;
  customer_name: string | null;
  itemCount: number;
  total: number;
  status: { value: SalesStatus; label: string };
  cashier?: string | null;
  isProvisional: boolean;
}

function StatusBadge({ status }: { status: SalesRow["status"] }) {
  if (status.value === "completed")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Completed</Badge>;
  if (status.value === "voided")
    return <Badge variant="destructive">Voided</Badge>;
  if (status.value === "pending_sync")
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Pending sync</Badge>;
  if (status.value === "sync_failed")
    return <Badge variant="destructive">Sync failed</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function orderToRow(o: Order): SalesRow {
  return {
    id: o.id,
    uuid: o.uuid,
    number: o.number,
    created_at: o.created_at ?? "",
    customer_name: o.customer_name,
    itemCount: o.items.length,
    total: Number(o.total),
    status: o.status,
    cashier: o.user?.name ?? null,
    isProvisional: false,
  };
}

function outboxToRow(e: {
  uuid: string;
  payload: {
    items: { product_id: number; quantity: number; unit_price: number }[];
    discount?: number;
    payments: { method: PaymentMethodValue; amount: number }[];
    customer_name?: string | null;
  };
  status: "pending" | "synced" | "failed";
  created_at: number;
}): SalesRow {
  const subtotal = e.payload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const total = Math.max(0, subtotal - (e.payload.discount ?? 0));
  return {
    id: null,
    uuid: e.uuid,
    number: "OFFLINE-" + e.uuid.slice(0, 8).toUpperCase(),
    created_at: new Date(e.created_at).toISOString(),
    customer_name: e.payload.customer_name ?? null,
    itemCount: e.payload.items.length,
    total,
    status:
      e.status === "failed"
        ? { value: "sync_failed", label: "Sync failed" }
        : { value: "pending_sync", label: "Pending sync" },
    cashier: null,
    isProvisional: true,
  };
}

export default function SalesHistory() {
  const { user } = useAuth();
  const canSeeAll = isAtLeast(user, "supervisor");
  const navigate = useNavigate();
  const outbox = useOutbox();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatusValue | "all">("all");
  const [page, setPage] = useState(1);

  const params: Record<string, unknown> = { search, page, per_page: 25 };
  if (status !== "all") params.status = status;

  const { data, isLoading, isFetching } = useOrders(params);

  const serverOrders = data?.data ?? [];
  const serverUuids = new Set(serverOrders.map((o) => o.uuid));

  // Pending/failed outbox rows, deduped against the current page of server
  // orders (a synced sale's server row supersedes its provisional row).
  const pendingRows = (outbox.all ?? [])
    .filter((e) => e.status === "pending" || e.status === "failed")
    .filter((e) => !serverUuids.has(e.uuid))
    .map(outboxToRow)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const rows = [...pendingRows, ...serverOrders.map(orderToRow)];
  const pendingCount = pendingRows.length;

  const columns: Column<SalesRow>[] = [
    {
      key: "number",
      header: "Order #",
      cell: (r) => <span className="font-medium">{r.number}</span>,
    },
    {
      key: "created_at",
      header: "Date",
      cell: (r) => formatDate(r.created_at),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (r) => r.customer_name ?? "Walk-in",
    },
    {
      key: "items",
      header: "Items",
      cell: (r) => r.itemCount,
    },
    {
      key: "total",
      header: "Total",
      cell: (r) => formatCurrency(r.total),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} />,
    },
    ...(canSeeAll
      ? [
          {
            key: "user",
            header: "Cashier",
            cell: (r: SalesRow) => r.cashier ?? "—",
          },
        ]
      : []),
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button
          variant="ghost"
          size="icon"
          disabled={r.isProvisional}
          onClick={() => r.id && navigate(`/pos/history/${r.id}`)}
        >
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Sales History" description={canSeeAll ? "All register sales" : "Your sales for this shift"} />

      {pendingCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {pendingCount} sale{pendingCount === 1 ? "" : "s"} pending sync — they’ll be sent to the server when connectivity returns.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by order # or customer…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v as OrderStatusValue | "all"); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading || isFetching}
        rowKey={(r) => r.uuid}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
        emptyMessage="No sales recorded yet."
      />
    </div>
  );
}