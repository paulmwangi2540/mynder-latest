import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import { isMiniAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

export default function RequireNonMiniAdmin() {
  const admin = useAdminAuthStore((state) => state.admin);
  const outletContext = useOutletContext<unknown>();

  return isMiniAdmin(admin)
    ? <Navigate to="/admin/expenses" replace />
    : <Outlet context={outletContext} />;
}
