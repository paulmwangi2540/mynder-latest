import { Navigate, Outlet } from "react-router-dom";
import { isStaffAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

export default function RequireStaffAdmin() {
  const admin = useAdminAuthStore((state) => state.admin);

  return isStaffAdmin(admin)
    ? <Outlet />
    : <Navigate to="/admin/users" replace />;
}
