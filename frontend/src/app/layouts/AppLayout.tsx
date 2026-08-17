import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  Contact,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Smartphone,
  Users,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { Role } from "@/app/auth/types";
import { useSync } from "@/app/offline/SyncManager";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/ModeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavLeaf {
  to: string;
  label: string;
  end?: boolean;
  roles?: Role[];
}

interface NavItem {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: NavLeaf[];
  end?: boolean;
  roles?: Role[];
}

const PRODUCTS_CHILDREN: NavLeaf[] = [
  { to: "/products/new", label: "Add New" },
  { to: "/products", label: "Product List" },
  { to: "/products/low-stock", label: "Low Stock" },
  { to: "/products/expiring", label: "Expiring Soon" },
  { to: "/suppliers", label: "Product Supplier" },
  { to: "/manufacturers", label: "Product Manufacturer" },
  { to: "/categories", label: "Product Category" },
  { to: "/units", label: "Product Unit" },
];

const EXPENSE_CHILDREN: NavLeaf[] = [
  { to: "/expense-categories", label: "Expense Category" },
  { to: "/expenses", label: "Expense List" },
];

const REPORTS_CHILDREN: NavLeaf[] = [
  { to: "/reports/sales", label: "Sales Report" },
  { to: "/pos/history", label: "Sales History" },
  { to: "/reports/sales-audit", label: "Sales Audit" },
  { to: "/reports/staff-sales", label: "Staff Sales", roles: ["admin"] },
];

const MANAGER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  {
    label: "Products",
    icon: Boxes,
    children: PRODUCTS_CHILDREN,
  },
  { to: "/employees", label: "Employee Record", icon: Users },
  { to: "/customers", label: "Customers", icon: Contact },
  {
    label: "Expenses",
    icon: Wallet,
    children: EXPENSE_CHILDREN,
  },
  {
    label: "Reports",
    icon: BarChart3,
    children: REPORTS_CHILDREN,
  },
  { to: "/consignments", label: "Product Consignment", icon: Package },
  { to: "/devices", label: "Devices", icon: Smartphone },
  { to: "/audit-logs", label: "Activity Log", icon: ScrollText },
];

const POS_NAV: NavItem[] = [
  { to: "/pos", label: "Make Sale", icon: ShoppingCart, end: true },
  { to: "/pos/history", label: "Sales History", icon: Receipt },
];

// Self-service — available to every signed-in user regardless of role.
const ACCOUNT_NAV: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings, end: true },
];

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { user } = useAuth();
  const role = user?.role;

  if (item.roles && (!role || !item.roles.includes(role))) {
    return null;
  }

  if (item.children) {
    const children = item.children.filter(
      (child) => !child.roles || (role && child.roles.includes(role)),
    );
    if (children.length === 0) {
      return null;
    }
    return (
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <item.icon className="size-4" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className="size-4 transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-4 border-l pl-2">
          {children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end={child.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive && "bg-accent font-medium text-foreground",
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <NavLink
      to={item.to!}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          isActive && "bg-accent text-foreground",
        )
      }
    >
      <item.icon className="size-4" />
      {item.label}
    </NavLink>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");

  return (
    <nav className="space-y-1 px-2 py-4">
      {POS_NAV.map((item) => (
        <NavRow key={item.label} item={item} onNavigate={onNavigate} />
      ))}
      {canManage && (
        <>
          <div className="my-2 border-t" />
          {MANAGER_NAV.map((item) => (
            <NavRow key={item.label} item={item} onNavigate={onNavigate} />
          ))}
        </>
      )}
      <div className="my-2 border-t" />
      {ACCOUNT_NAV.map((item) => (
        <NavRow key={item.label} item={item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-right text-sm leading-tight">
        <div className="font-medium">{user?.name}</div>
        <div className="text-xs capitalize text-muted-foreground">
          {user?.role} · {user?.tenant?.name}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        <LogOut className="size-4" /> Sign out
      </Button>
    </div>
  );
}

function SyncStatus() {
  const { online, pendingCount, draining } = useSync();

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        online
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-warning",
      )}
      title={
        online
          ? draining
            ? "Syncing pending sales…"
            : "Online"
          : "Offline — sales are queued and will sync on reconnect"
      }
    >
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      <span>{online ? "Online" : "Offline"}</span>
      {pendingCount > 0 && (
        <Badge
          variant="secondary"
          className="ml-1 h-4 px-1.5 text-[10px] leading-none"
        >
          {pendingCount}
        </Badge>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="" className="size-8 rounded-md object-contain" />
      <span className="text-lg font-semibold tracking-tight">Hauzab</span>
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pos": "Make Sale",
  "/pos/history": "Sales History",
  "/products": "Products",
  "/products/new": "Add Product",
  "/products/low-stock": "Low Stock",
  "/products/expiring": "Expiring Soon",
  "/suppliers": "Suppliers",
  "/manufacturers": "Manufacturers",
  "/categories": "Categories",
  "/units": "Units",
  "/employees": "Employees",
  "/customers": "Customers",
  "/devices": "Devices",
  "/expenses": "Expenses",
  "/expense-categories": "Expense Categories",
  "/reports/sales": "Sales Report",
  "/reports/sales-audit": "Sales Audit",
  "/reports/staff-sales": "Staff Sales",
  "/consignments": "Consignments",
  "/audit-logs": "Activity Log",
  "/settings": "Settings",
};

function pageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (PAGE_TITLES[`/${pathname.split("/")[1]}`]) return PAGE_TITLES[`/${pathname.split("/")[1]}`];
  return "Hauzab";
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
          <div className="flex h-16 items-center border-b px-5">
            <BrandMark />
          </div>
          <SidebarBody />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Open navigation menu">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex h-16 items-center justify-between gap-2 border-b px-5">
                    <BrandMark />
                  </div>
                  <SidebarBody onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <span className="text-lg font-semibold">Hauzab</span>
            </div>
            <h1 className="hidden text-base font-semibold md:block">{pageTitle(pathname)}</h1>
            <div className="flex items-center gap-2">
              <ModeToggle />
              <div className="hidden sm:block">
                <SyncStatus />
              </div>
              <UserMenu />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <ErrorBoundary resetKey={pathname}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                    Loading…
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}