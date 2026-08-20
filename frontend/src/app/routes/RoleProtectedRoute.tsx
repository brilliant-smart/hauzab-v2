import { Navigate } from "react-router-dom";
import { useAuth } from "@/app/auth/AuthContext";
import { Role } from "@/app/auth/types";

const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  supervisor: "/dashboard",
  staff: "/dashboard",
  inventory_manager: "/products",
};

interface Props {
  allowedRoles: Role[];
  children: JSX.Element;
}

export default function RoleProtectedRoute({ allowedRoles, children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="spinner">Loading…</div>;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user?.role || "staff"]} replace />;
  }

  return children;
}