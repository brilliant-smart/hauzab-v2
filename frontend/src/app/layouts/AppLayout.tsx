import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  Contact,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
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
import { useDocumentTitle } from "@/app/lib/useDocumentTitle";
import { useSync } from "@/app/offline/SyncManager";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  managerOnly?: boolean;
}

const PRODUCTS_CHILDREN: NavLeaf[] = [
  { to: "/products/new", label: "Add New" },
  { to: "/products", label: "Product List", end: true },
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
  { to: "/reports/sales-audit", label: "Sales Audit", roles: ["admin"] },
  { to: "/reports/staff-sales", label: "Staff Sales", roles: ["admin"] },
];

// Single ordered nav list. Make Sale and the manager items are gated by role:
// managerOnly hides an item below supervisor; an explicit `roles` allow-list
// narrows further. Inventory Manager (products-only) is hidden from Make Sale
// via SELLER_ROLES and sees only the Products group (PRODUCT_ROLES); every other
// managerOnly item is auto-hidden for it by rank.
const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true, managerOnly: true },
  { to: "/pos", label: "Make Sale", icon: ShoppingCart, end: true, roles: ["admin", "supervisor", "staff"] },
  { label: "Products", icon: Boxes, children: PRODUCTS_CHILDREN, roles: ["admin", "supervisor", "inventory_manager"] },
  { label: "Reports", icon: BarChart3, children: REPORTS_CHILDREN, managerOnly: true },
  { label: "Expenses", icon: Wallet, children: EXPENSE_CHILDREN, managerOnly: true },
  { to: "/employees", label: "Employee Records", icon: Users, managerOnly: true, roles: ["admin"] },
  { to: "/customers", label: "Customers", icon: Contact, managerOnly: true },
  { to: "/consignments", label: "Stock Receipts", icon: Package, managerOnly: true },
  { to: "/devices", label: "Devices", icon: Smartphone, managerOnly: true, roles: ["admin"] },
  { to: "/audit-logs", label: "Activity Log", icon: ScrollText, managerOnly: true, roles: ["admin"] },
];

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { user } = useAuth();
  const role = user?.role;

  if (item.managerOnly && !isAtLeast(user, "supervisor")) {
    return null;
  }

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
                  isActive && "bg-primary/10 text-primary font-medium",
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
          isActive && "bg-primary/10 text-primary font-medium",
        )
      }
    >
      <item.icon className="size-4" />
      {item.label}
    </NavLink>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1 px-2 py-4">
      {PRIMARY_NAV.map((item) => (
        <NavRow key={item.label} item={item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabelOf(role?: string | null): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Inline sync indicator rendered inside the user menu — keeps the offline-first
// status visible without crowding the header.
function SyncStatusRow() {
  const { online, pendingCount, draining } = useSync();
  const label = online ? (draining ? "Syncing…" : "Online") : "Offline";
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"
      title={
        online
          ? draining
            ? "Syncing pending sales…"
            : "All changes synced"
          : "Offline — sales are queued and will sync on reconnect"
      }
    >
      {online ? (
        <Wifi className="size-3.5 text-emerald-500" />
      ) : (
        <WifiOff className="size-3.5 text-amber-500" />
      )}
      <span>{label}</span>
      {pendingCount > 0 && (
        <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px] leading-none">
          {pendingCount} pending
        </Badge>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { online } = useSync();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 px-1.5 py-1.5">
          <span className="relative">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initialsOf(user?.name)}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card",
                online ? "bg-emerald-500" : "bg-amber-500",
              )}
              title={online ? "Online" : "Offline"}
            />
          </span>
          <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initialsOf(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
          </div>
        </div>
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          {roleLabelOf(user?.role)} · {user?.tenant?.name}
        </div>
        <DropdownMenuSeparator />
        <SyncStatusRow />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <Settings className="mr-2 size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrandMark() {
  const { user } = useAuth();
  const name = user?.tenant?.name ?? "Hauzab";
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="" className="size-8 shrink-0 rounded-md object-contain" />
      <span className="whitespace-nowrap text-base font-semibold tracking-tight">{name}</span>
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
  "/consignments": "Stock Receipts",
  "/audit-logs": "Activity Log",
  "/settings": "Settings",
};

function pageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (PAGE_TITLES[`/${pathname.split("/")[1]}`]) return PAGE_TITLES[`/${pathname.split("/")[1]}`];
  return "";
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();

  const tenantName = user?.tenant?.name ?? "Hauzab";

  // Browser-tab title: "<Tenant> - <Section>" (e.g. "Hauzab Super Market - Dashboard").
  const section = pageTitle(pathname);
  useDocumentTitle(section ? `${tenantName} - ${section}` : tenantName);

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
            <div className="flex min-w-0 items-center gap-2 md:hidden">
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
              <span className="min-w-0 truncate text-base font-semibold">{tenantName}</span>
            </div>
            <h1 className="hidden text-base font-semibold md:block">{pageTitle(pathname) || tenantName}</h1>
            <div className="flex items-center gap-2">
              <ModeToggle />
              <UserMenu />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <ErrorBoundary resetKey={pathname}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading…
                  </div>
                }
              >
                <div key={pathname} className="animate-page-in">
                  <Outlet />
                </div>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}