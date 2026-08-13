import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  PackagePlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { useExpiring, useLowStock, useProducts } from "@/app/api/catalog";
import { useEmployees } from "@/app/api/employees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  to,
}: {
  title: string;
  value: number | string;
  icon: typeof Boxes;
  hint?: string;
  to?: string;
}) {
  const body = (
    <>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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

export default function Dashboard() {
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");

  const products = useProducts({ per_page: 1 });
  const lowStock = useLowStock({ per_page: 1 });
  const expiring = useExpiring({ per_page: 1 });
  const employees = useEmployees({ per_page: 1 });

  const totalProducts = products.data?.total ?? 0;
  const totalLowStock = lowStock.data?.total ?? 0;
  const totalExpiring = expiring.data?.total ?? 0;
  const totalEmployees = employees.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user?.tenant?.name} · {user?.branch?.name}
        </p>
      </div>

      {canManage ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Products" value={totalProducts} icon={Boxes} to="/products" />
            <StatCard
              title="Low Stock"
              value={totalLowStock}
              icon={AlertTriangle}
              hint="At or below reorder level"
              to="/products/low-stock"
            />
            <StatCard
              title="Expiring Soon"
              value={totalExpiring}
              icon={CalendarClock}
              hint="Within 90 days"
              to="/products/expiring"
            />
            <StatCard title="Employees" value={totalEmployees} icon={Users} to="/employees" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
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
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Cashier and sales tools will be available in the next phase.
          </CardContent>
        </Card>
      )}
    </div>
  );
}