import { Navigate } from "react-router-dom";
import { useAdminAuthStore, isSuperAdmin } from "../stores/adminAuthStore";
import SuperAdminLayout from "../roles/SuperAdminLayout";
import StaffLayout from "../roles/StaffLayout";

export default function RoleAdminLayout() {
  const admin = useAdminAuthStore((state) => state.admin);

  if (!admin) return <Navigate to="/admin/login" replace />;
  return isSuperAdmin(admin)
    ? <SuperAdminLayout />
    : <StaffLayout />;
}
