import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/app/pages/Login";
import ForgotPassword from "@/app/pages/ForgotPassword";
import ResetPassword from "@/app/pages/ResetPassword";
import Unauthorized from "@/app/pages/Unauthorized";
import NotFound from "@/app/pages/NotFound";
import AppLayout from "@/app/layouts/AppLayout";
import ProtectedRoute from "@/app/routes/ProtectedRoute";
import RoleProtectedRoute from "@/app/routes/RoleProtectedRoute";
import { useAuth } from "@/app/auth/AuthContext";
import { homePathFor } from "@/app/auth/guards";

// Page-level routes are code-split. The Suspense boundary lives in AppLayout
// (around <Outlet/>), so every routed page beneath it lazy-loads without a
// flash. Login, Unauthorized, and the password-recovery pages render outside
// AppLayout and stay eager.
const Dashboard = lazy(() => import("@/app/pages/Dashboard"));
const ProductList = lazy(() => import("@/app/pages/products/ProductList"));
const ProductForm = lazy(() => import("@/app/pages/products/ProductForm"));
const LowStock = lazy(() => import("@/app/pages/products/LowStock"));
const Expiring = lazy(() => import("@/app/pages/products/Expiring"));
const Suppliers = lazy(() => import("@/app/pages/products/Suppliers"));
const Manufacturers = lazy(() => import("@/app/pages/products/Manufacturers"));
const Categories = lazy(() => import("@/app/pages/products/Categories"));
const Units = lazy(() => import("@/app/pages/products/Units"));
const EmployeeList = lazy(() => import("@/app/pages/employees/EmployeeList"));
const EmployeeForm = lazy(() => import("@/app/pages/employees/EmployeeForm"));
const MakeSale = lazy(() => import("@/app/pages/pos/MakeSale"));
const SalesHistory = lazy(() => import("@/app/pages/pos/SalesHistory"));
const SaleDetail = lazy(() => import("@/app/pages/pos/SaleDetail"));
const ExpenseCategories = lazy(() => import("@/app/pages/expenses/ExpenseCategories"));
const ExpenseList = lazy(() => import("@/app/pages/expenses/ExpenseList"));
const SalesReport = lazy(() => import("@/app/pages/reports/SalesReport"));
const SalesAudit = lazy(() => import("@/app/pages/reports/SalesAudit"));
const StaffSales = lazy(() => import("@/app/pages/reports/StaffSales"));
const ConsignmentList = lazy(() => import("@/app/pages/consignments/ConsignmentList"));
const ConsignmentForm = lazy(() => import("@/app/pages/consignments/ConsignmentForm"));
const ActivityLog = lazy(() => import("@/app/pages/audit/ActivityLog"));
const CustomerList = lazy(() => import("@/app/pages/customers/CustomerList"));
const DeviceList = lazy(() => import("@/app/pages/devices/DeviceList"));
const Settings = lazy(() => import("@/app/pages/Settings"));

const MANAGER_ROLES = ["admin", "supervisor"] as const;
// Catalog management — admins, supervisors, and the products-only Inventory
// Manager role (which ranks outside the ladder and is added explicitly here).
const PRODUCT_ROLES = ["admin", "supervisor", "inventory_manager"] as const;
// Selling + sales history + customers + dashboard — everyone except the
// products-only Inventory Manager, which is excluded from this list.
const SELLER_ROLES = ["admin", "supervisor", "staff"] as const;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard — cashiers and managers (Inventory Manager lands on /products). */}
        <Route
          path="/dashboard"
          element={
            <RoleProtectedRoute allowedRoles={[...SELLER_ROLES]}>
              <Dashboard />
            </RoleProtectedRoute>
          }
        />

        {/* Register — cashiers and managers. The products-only Inventory
            Manager is excluded from SELLER_ROLES and cannot sell. */}
        <Route
          path="/pos"
          element={
            <RoleProtectedRoute allowedRoles={[...SELLER_ROLES]}>
              <MakeSale />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/pos/history"
          element={
            <RoleProtectedRoute allowedRoles={[...SELLER_ROLES]}>
              <SalesHistory />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/pos/history/:id"
          element={
            <RoleProtectedRoute allowedRoles={[...SELLER_ROLES]}>
              <SaleDetail />
            </RoleProtectedRoute>
          }
        />

        {/* Products group — admins, supervisors, and Inventory Manager. */}
        <Route
          path="/products"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <ProductList />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/new"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <ProductForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/:id/edit"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <ProductForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/low-stock"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <LowStock />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/products/expiring"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <Expiring />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="/suppliers"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <Suppliers />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/manufacturers"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <Manufacturers />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <Categories />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/units"
          element={
            <RoleProtectedRoute allowedRoles={[...PRODUCT_ROLES]}>
              <Units />
            </RoleProtectedRoute>
          }
        />

        {/* Employee records — admin only (owner decision). */}
        <Route
          path="/employees"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <EmployeeList />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/employees/new"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <EmployeeForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/employees/:id/edit"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <EmployeeForm />
            </RoleProtectedRoute>
          }
        />

        {/* Customers — cashiers and managers (Inventory Manager excluded). */}
        <Route
          path="/customers"
          element={
            <RoleProtectedRoute allowedRoles={[...SELLER_ROLES]}>
              <CustomerList />
            </RoleProtectedRoute>
          }
        />

        {/* Devices — admin only. */}
        <Route
          path="/devices"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <DeviceList />
            </RoleProtectedRoute>
          }
        />

        {/* Expenses — admin|supervisor */}
        <Route
          path="/expense-categories"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ExpenseCategories />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ExpenseList />
            </RoleProtectedRoute>
          }
        />

        {/* Reports — admin|supervisor (staff-sales admin only) */}
        <Route
          path="/reports/sales"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <SalesReport />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/reports/sales-audit"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <SalesAudit />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/reports/staff-sales"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <StaffSales />
            </RoleProtectedRoute>
          }
        />

        {/* Stock Receipts — admin|supervisor */}
        <Route
          path="/consignments"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ConsignmentList />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/consignments/new"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ConsignmentForm />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/consignments/:id/edit"
          element={
            <RoleProtectedRoute allowedRoles={[...MANAGER_ROLES]}>
              <ConsignmentForm />
            </RoleProtectedRoute>
          }
        />

        {/* Activity log — admin only */}
        <Route
          path="/audit-logs"
          element={
            <RoleProtectedRoute allowedRoles={["admin"]}>
              <ActivityLog />
            </RoleProtectedRoute>
          }
        />

        {/* Settings — self-service for every signed-in user. */}
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}