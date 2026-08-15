import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  PackagePlus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { useExpiring, useLowStock, useProducts } from "@/app/api/catalog";
import { useDashboardSummary } from "@/app/api/dashboard";
import { useEmployees } from "@/app/api/employees";
import { useOrders } from "@/app/api/orders";
import { formatCurrency } from "@/app/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  to,
  loading,
}: {
  title: string;
  value: number | string;
  icon: typeof Boxes;
  hint?: string;
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">
          {loading ? <Skeleton className="h-7 w-24" /> : value}
        </div>
        {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </>
  );

  return to ? (
    <Link to={to}>
      <Card className="transition-colors hover:bg-accent/40">{body}</Card>
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}

function ManagerDashboard() {
  const products = useProducts({ per_page: 1 });
  const lowStock = useLowStock({ per_page: 1 });
  const expiring = useExpiring({ per_page: 1 });
  const employees = useEmployees({ per_page: 1 });
  const summary = useDashboardSummary();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(summary.data?.today.total ?? 0)}
          icon={TrendingUp}
          hint={`${summary.data?.today.count ?? 0} sales`}
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <StatCard
          title="This Week"
          value={formatCurrency(summary.data?.week.total ?? 0)}
          icon={Receipt}
          hint={`${summary.data?.week.count ?? 0} sales`}
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <StatCard
          title="This Year"
          value={formatCurrency(summary.data?.year.total ?? 0)}
          icon={ShoppingCart}
          hint={`${summary.data?.year.count ?? 0} sales`}
          to="/reports/sales"
          loading={summary.isLoading}
        />
        <StatCard
          title="Monthly Expense"
          value={formatCurrency(summary.data?.monthly_expense ?? 0)}
          icon={Wallet}
          to="/expenses"
          loading={summary.isLoading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Products" value={products.data?.total ?? 0} icon={Boxes} to="/products" loading={products.isLoading} />
        <StatCard
          title="Low Stock"
          value={lowStock.data?.total ?? 0}
          icon={AlertTriangle}
          hint="At or below reorder level"
          to="/products/low-stock"
          loading={lowStock.isLoading}
        />
        <StatCard
          title="Expiring Soon"
          value={expiring.data?.total ?? 0}
          icon={CalendarClock}
          hint="Within 90 days"
          to="/products/expiring"
          loading={expiring.isLoading}
        />
        <StatCard title="Employees" value={employees.data?.total ?? 0} icon={Users} to="/employees" loading={employees.isLoading} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/pos">
            <ShoppingCart className="size-4" /> Make Sale
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/products/new">
            <PackagePlus className="size-4" /> Add Product
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/products">Product List</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/employees">Employee Record</Link>
        </Button>
      </div>
    </>
  );
}

function CashierDashboard() {
  const sales = useOrders({ per_page: 1 });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/pos">
          <Card className="transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open Register</CardTitle>
              <ShoppingCart className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">Make a sale</div>
              <p className="mt-1 text-xs text-muted-foreground">Scan items and tender payment</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/pos/history">
          <Card className="transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Your Sales</CardTitle>
              <Receipt className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {sales.isLoading ? <Skeleton className="h-7 w-16" /> : sales.data?.total ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Sales recorded on your account</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`}
        description={`${user?.tenant?.name ?? ""} · ${user?.branch?.name ?? ""}`}
      />

      {canManage ? <ManagerDashboard /> : <CashierDashboard />}
    </div>
  );
}