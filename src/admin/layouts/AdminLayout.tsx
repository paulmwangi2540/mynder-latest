import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { useUsers } from "../hooks/useUsers";
import { getCurrentShift } from "../services/timeTrackingService";
import { useAdminAuthStore } from "../stores/adminAuthStore";

export type AdminAudience = "super-admin" | "staff";

export default function AdminLayout({ audience }: { audience: AdminAudience }) {
  const [search, setSearch] = useState("");
  const [university, setUniversity] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const currentShiftQuery = useQuery({
    queryKey: ["admin-time-tracking", adminId ?? "", "current"],
    queryFn: getCurrentShift,
    enabled: audience === "staff" && Boolean(adminId),
    staleTime: 0,
    refetchInterval: (query) => query.state.data ? 5_000 : 30_000,
    refetchOnWindowFocus: true,
  });
  const staffShiftActive =
    currentShiftQuery.data?.status === "active" ||
    currentShiftQuery.data?.status === "paused";
  const isAttendancePage =
    location.pathname === "/admin/attendance" ||
    location.pathname === "/staff/attendance";
  const isUsersPage =
    location.pathname === "/admin/users" ||
    location.pathname === "/staff/users";
  const { users } = useUsers({
    enabled: audience !== "staff" || staffShiftActive,
  });
  const universities = [...new Set(users.map((user) => user.university).filter((name) => name.trim()))]
    .sort((left, right) => left.localeCompare(right));

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (
    audience === "staff" &&
    !isAttendancePage &&
    !staffShiftActive
  ) {
    return <Navigate to="/admin/attendance" replace />;
  }

  const exportUsers = () => {
    const csv = [
      ["Name", "University", "Major", "Instagram", "Bio", "Song", "Image Count"].join(","),
      ...users.map((user) => [user.name, user.university, user.major, user.instagram, user.bio ?? "", user.song ?? "", user.images.length].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mylnder-users.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-theme min-h-screen bg-[#0b1828] text-slate-100">
      <AdminSidebar
        audience={audience}
        staffShiftActive={staffShiftActive}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="min-h-screen min-w-0 xl:pl-[272px]">
        <AdminHeader
          search={search}
          onSearch={setSearch}
          university={university}
          universities={universities}
          onUniversityChange={setUniversity}
          showSearch={audience === "super-admin" || isUsersPage}
          showUniversityFilter={isUsersPage}
          showExport={isUsersPage}
          superAdmin={audience === "super-admin"}
          onExport={exportUsers}
          onMenuClick={() => setSidebarOpen(true)}
          sidebarOpen={sidebarOpen}
        />
        <div className="admin-page-content w-full min-w-0 px-4 pb-10 pt-5 sm:px-7 lg:px-8">
          <Outlet context={{ search, university, setSearch, setUniversity, route: location.pathname }} />
        </div>
      </div>
    </div>
  );
}