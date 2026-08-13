import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/app/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span> {user?.name}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Role:</span> {user?.role}
          </p>
          <p>
            <span className="text-muted-foreground">Tenant:</span>{" "}
            {user?.tenant?.name ?? user?.tenant_id ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Branch:</span>{" "}
            {user?.branch?.name ?? user?.branch_id ?? "—"}
          </p>
          <Button onClick={handleLogout} variant="outline" className="mt-4">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}