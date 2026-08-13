import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { useOrders } from "@/app/api/orders";
import { Order, OrderStatusValue } from "@/app/api/types";
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

function StatusBadge({ status }: { status: Order["status"] }) {
  if (status.value === "completed")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Completed</Badge>;
  if (status.value === "voided")
    return <Badge variant="destructive">Voided</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default function SalesHistory() {
  const { user } = useAuth();
  const canSeeAll = isAtLeast(user, "supervisor");
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatusValue | "all">("all");
  const [page, setPage] = useState(1);

  const params: Record<string, unknown> = { search, page, per_page: 25 };
  if (status !== "all") params.status = status;

  const { data, isLoading, isFetching } = useOrders(params);

  const columns: Column<Order>[] = [
    {
      key: "number",
      header: "Order #",
      cell: (o) => <span className="font-medium">{o.number}</span>,
    },
    {
      key: "created_at",
      header: "Date",
      cell: (o) => formatDate(o.created_at),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (o) => o.customer_name ?? "Walk-in",
    },
    {
      key: "items",
      header: "Items",
      cell: (o) => o.items.length,
    },
    {
      key: "total",
      header: "Total",
      cell: (o) => formatCurrency(o.total),
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => <StatusBadge status={o.status} />,
    },
    ...(canSeeAll
      ? [
          {
            key: "user",
            header: "Cashier",
            cell: (o: Order) => o.user?.name ?? "—",
          },
        ]
      : []),
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (o) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/pos/history/${o.id}`)}
        >
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Sales History" description={canSeeAll ? "All register sales" : "Your sales for this shift"} />

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
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        rowKey={(o) => o.id}
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