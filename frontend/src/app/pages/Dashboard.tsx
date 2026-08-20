import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Banknote,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { useDashboardSummary } from "@/app/api/dashboard";
import { useOrders } from "@/app/api/orders";
import { formatCurrency } from "@/app/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { DashboardCharts } from "@/app/pages/dashboard/DashboardCharts";

type Tone = "success" | "secondary" | "warning" | "danger" | "info" | "primary" | "dark" | "violet";

const TONES: Record<Tone, string> = {
  success: "bg-gradient-to-br from-emerald-500 to-emerald-600",
  secondary: "bg-gradient-to-br from-slate-500 to-slate-600",
  warning: "bg-gradient-to-br from-amber-500 to-amber-600",
  danger: "bg-gradient-to-br from-rose-500 to-rose-600",
  info: "bg-gradient-to-br from-sky-500 to-sky-600",
  primary: "bg-gradient-to-br from-blue-600 to-blue-700",
  dark: "bg-gradient-to-br from-slate-800 to-slate-900",
  violet: "bg-gradient-to-br from-violet-500 to-violet-600",
};

function ColorStatCard({
  title,
  value,
  icon: Icon,
  tone,
  to,
  loading,
}: {
  title: string;
  value: string;
  icon: typeof Banknote;
  tone: Tone;
  to?: string;
  loading?: boolean;
}) {
  const card = (
    <div
      className={`${TONES[tone]} rounded-lg text-white shadow-md ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className="p-5">
        <h5 className="text-sm font-medium text-white/85">{title}</h5>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
            <Icon className="size-5 text-white" />
          </div>
          <h6 className="text-xl font-semibold tabular-nums">
            {loading ? <Skeleton className="h-7 w-24 bg-white/30" /> : value}
          </h6>
        </div>
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function ManagerDashboard() {
  const summary = useDashboardSummary();

  const monthName = new Date().toLocaleString("en-GB", { month: "long" });
  const year = new Date().getFullYear();

  return (
    <div className="space-y-4">
      {/* Row 1: the four colored summary cards. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ColorStatCard
          title="Today Sales"
          value={formatCurrency(summary.data?.today.total ?? 0)}
          icon={Banknote}
          tone="success"
          to="/pos/history"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title={`${monthName} Expense`}
          value={formatCurrency(summary.data?.monthly_expense ?? 0)}
          icon={Wallet}
          tone="secondary"
          to="/expenses"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title="Low in stock"
          value={String(summary.data?.low_stock_count ?? 0)}
          icon={AlertTriangle}
          tone="warning"
          to="/products/low-stock"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title="Product about to Expire"
          value={String(summary.data?.expiring_count ?? 0)}
          icon={CalendarClock}
          tone="danger"
          to="/products/expiring"
          loading={summary.isLoading}
        />
      </div>

      {/* Row 2: the three sales-period cards + the catalog count. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ColorStatCard
          title="This Week Sales"
          value={formatCurrency(summary.data?.week.total ?? 0)}
          icon={Banknote}
          tone="info"
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title={`${monthName} Sales`}
          value={formatCurrency(summary.data?.month.total ?? 0)}
          icon={Banknote}
          tone="primary"
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title={`${year} Sales`}
          value={formatCurrency(summary.data?.year.total ?? 0)}
          icon={Banknote}
          tone="dark"
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <ColorStatCard
          title="Total Products"
          value={String(summary.data?.products_count ?? 0)}
          icon={Boxes}
          tone="violet"
          to="/products"
          loading={summary.isLoading}
        />
      </div>

      {/* Row 3: trend + breakdown charts for the last 30 days. */}
      <DashboardCharts />
    </div>
  );
}

function CashierDashboard() {
  const sales = useOrders({ per_page: 1 });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link to="/pos">
        <div className="rounded-lg border bg-card p-5 shadow-sm transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-muted-foreground">Open Register</h5>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-lg font-semibold">Make a sale</div>
          <p className="mt-1 text-xs text-muted-foreground">Scan items and tender payment</p>
        </div>
      </Link>
      <Link to="/pos/history">
        <div className="rounded-lg border bg-card p-5 shadow-sm transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-muted-foreground">Your Sales</h5>
            <Receipt className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {sales.isLoading ? <Skeleton className="h-7 w-16" /> : sales.data?.total ?? 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Sales recorded on your account</p>
        </div>
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`${user?.tenant?.name ?? ""} · ${user?.branch?.name ?? ""}`} />
      {canManage ? <ManagerDashboard /> : <CashierDashboard />}
    </div>
  );
}