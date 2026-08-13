import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/app/pages/Login";
import Dashboard from "@/app/pages/Dashboard";
import Unauthorized from "@/app/pages/Unauthorized";
import ProtectedRoute from "@/app/routes/ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}