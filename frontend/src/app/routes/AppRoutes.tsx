import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/app/pages/Login";
import Dashboard from "@/app/pages/Dashboard";
import Unauthorized from "@/app/pages/Unauthorized";
import AppLayout from "@/app/layouts/AppLayout";
import ProtectedRoute from "@/app/routes/ProtectedRoute";
import RoleProtectedRoute from "@/app/routes/RoleProtectedRoute";
import { useAuth } from "@/app/auth/AuthContext";
import { homePathFor } from "@/app/auth/guards";
import ProductList from "@/app/pages/products/ProductList";
import ProductForm from "@/app/pages/products/ProductForm";
import LowStock from "@/app/pages/products/LowStock";
import Expiring from "@/app/pages/products/Expiring";
import Suppliers from "@/app/pages/products/Suppliers";
import Manufacturers from "@/app/pages/products/Manufacturers";
import Categories from "@/app/pages/products/Categories";
import Units from "@/app/pages/products/Units";
import EmployeeList from "@/app/pages/employees/EmployeeList";
import EmployeeForm from "@/app/pages/employees/EmployeeForm";
import MakeSale from "@/app/pages/pos/MakeSale";
import SalesHistory from "@/app/pages/pos/SalesHistory";
import SaleDetail from "@/app/pages/pos/SaleDetail";

const MANAGER_ROLES = ["admin", "supervisor"] as const;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Register — available to every signed-in staff member. */}
        <Route path="/pos" element={<MakeSale />} />
        <Route path="/pos/history" element={<SalesHistory />} />
        <Route path="/pos/history/:id" element={<SaleDetail />} />

        <Route
          path="/products"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ProductList />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/new"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ProductForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/:id/edit"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ProductForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/low-stock"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <LowStock />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/expiring"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <Expiring />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/suppliers"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <Suppliers />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/manufacturers"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <Manufacturers />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <Categories />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/units"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <Units />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/employees"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <EmployeeList />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/employees/new"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <EmployeeForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/employees/:id/edit"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <EmployeeForm />
            </RoleProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}