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
import RequireExpenseAdmin from "../admin/components/RequireExpenseAdmin";
import RequireNonMiniAdmin from "../admin/components/RequireNonMiniAdmin";
import RequireStaffAdmin from "../admin/components/RequireStaffAdmin";

const Accounts = lazy(() => import("../admin/pages/Accounts"));
const Expenses = lazy(() => import("../admin/pages/Expenses"));
const EmailInventory = lazy(() => import("../admin/pages/EmailInventory"));
const Reports = lazy(() => import("../admin/pages/Reports"));
const StaffSalesHistory = lazy(() => import("../admin/pages/StaffSalesHistory"));
const StaffDashboard = lazy(() => import("../admin/pages/StaffDashboard"));
const StaffUniversities = lazy(() => import("../admin/pages/StaffUniversities"));
const Commissions = lazy(() => import("../admin/pages/Commissions"));
const Frames = lazy(() => import("../admin/pages/Frames"));

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/signup" element={<Navigate to="/admin/login" replace />} />
      <Route element={<RequireAdmin />}>
        <Route element={<RoleAdminLayout />}>
          <Route element={<RequireNonMiniAdmin />}>
            <Route path="/" element={<Navigate to="/admin/users" replace />} />
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />
            <Route element={<RequireStaffAdmin />}>
              <Route path="/staff/dashboard" element={<Suspense fallback={<LoadingState label="Loading your dashboard..." />}><StaffDashboard /></Suspense>} />
              <Route path="/staff/universities" element={<Suspense fallback={<LoadingState label="Loading your universities..." />}><StaffUniversities /></Suspense>} />
              <Route path="/staff/frames" element={<Suspense fallback={<LoadingState label="Loading Frames..." />}><Frames /></Suspense>} />
              <Route path="/staff/commissions" element={<Suspense fallback={<LoadingState label="Loading commissions..." />}><Commissions /></Suspense>} />
            </Route>
            <Route path="/staff/attendance" element={<Attendance />} />
            <Route path="/staff/users" element={<Users />} />
            <Route path="/staff/users/:userId" element={<UserDetails />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/users/:userId" element={<UserDetails />} />
            <Route path="/admin/attendance" element={<Attendance />} />
            <Route path="/admin/accounts" element={<Suspense fallback={<LoadingState label="Loading accounts..." />}><Accounts /></Suspense>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route element={<RequireExpenseAdmin />}>
          <Route element={<RoleAdminLayout />}>
            <Route path="/admin/expenses" element={<Suspense fallback={<LoadingState label="Loading expenses..." />}><Expenses /></Suspense>} />
            <Route path="/admin/emails" element={<Suspense fallback={<LoadingState label="Loading email inventory..." />}><EmailInventory /></Suspense>} />
          </Route>
        </Route>
        <Route element={<RequireSuperAdmin />}>
          <Route element={<SuperAdminLayout />}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/universities" element={<Universities />} />
            <Route path="/admin/invoices" element={<Invoices />} />
            <Route path="/admin/reports" element={<Suspense fallback={<LoadingState label="Loading reports..." />}><Reports /></Suspense>} />
            <Route path="/admin/staff-sales" element={<Suspense fallback={<LoadingState label="Loading staff sales..." />}><StaffSalesHistory /></Suspense>} />
            <Route path="/admin/commissions" element={<Suspense fallback={<LoadingState label="Loading commissions..." />}><Commissions /></Suspense>} />
            <Route path="/admin/frames" element={<Suspense fallback={<LoadingState label="Loading Frames..." />}><Frames /></Suspense>} />
            <Route path="/admin/plan" element={<PaymentPlan />} />
            <Route path="/admin/admins" element={<Admins />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}