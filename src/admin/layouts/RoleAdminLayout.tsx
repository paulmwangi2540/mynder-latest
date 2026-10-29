import { Navigate } from "react-router-dom";
import { useAdminAuthStore, isMiniAdmin, isSuperAdmin } from "../stores/adminAuthStore";
import SuperAdminLayout from "../roles/SuperAdminLayout";
import StaffLayout from "../roles/StaffLayout";
import MiniAdminLayout from "../roles/MiniAdminLayout";

export default function RoleAdminLayout() {
  const admin = useAdminAuthStore((state) => state.admin);

  if (!admin) return <Navigate to="/admin/login" replace />;
  return isSuperAdmin(admin)
    ? <SuperAdminLayout />
    : isMiniAdmin(admin)
      ? <MiniAdminLayout />
      : <StaffLayout />;
}
