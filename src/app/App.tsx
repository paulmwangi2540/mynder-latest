import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoadingState from "../components/shared/LoadingState";
import RoleAdminLayout from "../admin/layouts/RoleAdminLayout";
import SuperAdminLayout from "../admin/roles/SuperAdminLayout";
import Dashboard from "../admin/pages/Dashboard";
import Users from "../admin/pages/Users";
import UserDetails from "../admin/pages/UserDetails";
import PaymentPlan from "../admin/pages/PaymentPlan";
import Universities from "../admin/pages/Universities";
import Invoices from "../admin/pages/Invoices";
import NotFound from "../admin/pages/NotFound";
import AdminLogin from "../admin/pages/AdminLogin";
import Admins from "../admin/pages/Admins";
import Attendance from "../admin/pages/Attendance";
import RequireAdmin from "../admin/components/RequireAdmin";
import RequireSuperAdmin from "../admin/components/RequireSuperAdmin";

const Accounts = lazy(() => import("../admin/pages/Accounts"));
const Expenses = lazy(() => import("../admin/pages/Expenses"));
const Reports = lazy(() => import("../admin/pages/Reports"));

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/signup" element={<Navigate to="/admin/login" replace />} />
      <Route element={<RequireAdmin />}>
        <Route element={<RoleAdminLayout />}>
          <Route path="/" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/staff" element={<Navigate to="/staff/attendance" replace />} />
          <Route path="/staff/attendance" element={<Attendance />} />
          <Route path="/staff/users" element={<Users />} />
          <Route path="/staff/users/:userId" element={<UserDetails />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/users/:userId" element={<UserDetails />} />
          <Route path="/admin/attendance" element={<Attendance />} />
          <Route path="/admin/accounts" element={<Suspense fallback={<LoadingState label="Loading accounts..." />}><Accounts /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<RequireSuperAdmin />}>
          <Route element={<SuperAdminLayout />}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/universities" element={<Universities />} />
            <Route path="/admin/invoices" element={<Invoices />} />
            <Route path="/admin/expenses" element={<Suspense fallback={<LoadingState label="Loading expenses..." />}><Expenses /></Suspense>} />
            <Route path="/admin/reports" element={<Suspense fallback={<LoadingState label="Loading reports..." />}><Reports /></Suspense>} />
            <Route path="/admin/plan" element={<PaymentPlan />} />
            <Route path="/admin/admins" element={<Admins />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}