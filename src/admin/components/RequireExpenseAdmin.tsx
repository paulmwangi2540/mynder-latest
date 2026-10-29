import { Navigate, Outlet } from "react-router-dom";
import { isMiniAdmin, isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

export default function RequireExpenseAdmin() {
  const admin = useAdminAuthStore((state) => state.admin);

  return isSuperAdmin(admin) || isMiniAdmin(admin)
    ? <Outlet />
    : <Navigate to="/admin/users" replace />;
}
