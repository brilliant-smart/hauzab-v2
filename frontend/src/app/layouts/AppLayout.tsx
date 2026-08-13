import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavLeaf {
  to: string;
  label: string;
  end?: boolean;
}

interface NavItem {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: NavLeaf[];
  end?: boolean;
}

const PRODUCTS_CHILDREN: NavLeaf[] = [
  { to: "/products/new", label: "Add New" },
  { to: "/products", label: "Product List" },
  { to: "/products/low-stock", label: "Product Reminder" },
  { to: "/products/expiring", label: "Expired Product" },
  { to: "/suppliers", label: "Product Supplier" },
  { to: "/manufacturers", label: "Product Manufacturer" },
  { to: "/categories", label: "Product Category" },
  { to: "/units", label: "Product Unit" },
];

const MANAGER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  {
    label: "Products",
    icon: Boxes,
    children: PRODUCTS_CHILDREN,
  },
  { to: "/employees", label: "Employee Record", icon: Users },
];

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  if (item.children) {
    return (
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <item.icon className="size-4" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className="size-4 transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-4 border-l pl-2">
          {item.children.map((child) => (
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
  return <nav className="space-y-1 px-2 py-4">{MANAGER_NAV.map((item) => (
    <NavRow key={item.label} item={item} onNavigate={onNavigate} />
  ))}</nav>;
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

export default function AppLayout() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const canManage = isAtLeast(user, "supervisor");

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
          <div className="flex h-16 items-center gap-2 border-b px-5">
            <ShoppingCart className="size-5 text-primary" />
            <span className="text-lg font-semibold">Hauzab</span>
          </div>
          {canManage ? (
            <SidebarBody />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              <ShieldAlert className="mb-2 size-5" />
              Cashier tools arrive in the next phase.
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex h-16 items-center justify-between gap-2 border-b px-5">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="size-5 text-primary" />
                      <span className="text-lg font-semibold">Hauzab</span>
                    </div>
                  </div>
                  <SidebarBody onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <span className="text-lg font-semibold">Hauzab</span>
            </div>
            <div className="hidden md:block" />
            <UserMenu />
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}