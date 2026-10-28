import { Bell, Download, Menu } from "lucide-react";
import { lazy, Suspense } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Logo from "../../components/shared/Logo";

const AdminNotifications = lazy(() => import("../components/AdminNotifications"));

interface Props {
  search: string;
  onSearch: (value: string) => void;
  university: string;
  universities: string[];
  onUniversityChange: (value: string) => void;
  showSearch: boolean;
  showUniversityFilter: boolean;
  showExport: boolean;
  superAdmin: boolean;
  onExport: () => void;
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

export default function AdminHeader({
  search,
  onSearch,
  university,
  universities,
  onUniversityChange,
  showSearch,
  showUniversityFilter,
  showExport,
  superAdmin,
  onExport,
  onMenuClick,
  sidebarOpen,
}: Props) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700 bg-[#0b1828]/95 px-4 py-3 text-white backdrop-blur sm:min-h-[82px] sm:gap-3 sm:px-8 xl:flex-nowrap xl:py-0">
      <button type="button" onClick={onMenuClick} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white hover:bg-slate-800 xl:hidden">
        <Menu size={24} />
      </button>
      <div className="flex min-w-0 items-center xl:hidden">
        <Logo />
      </div>
      {showSearch && (
        <div className="order-3 flex w-full min-w-0 basis-full items-center gap-2 sm:max-w-full xl:order-none xl:ml-auto xl:basis-auto xl:max-w-[680px] xl:flex-1">
          <div className="min-w-0 flex-1">
            <Input
              search
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={superAdmin
                ? "Search users by name, university, or invoice..."
                : "Search users by name or university..."}
            />
          </div>
          {showUniversityFilter && (
            <label className="sr-only" htmlFor="user-university-filter">Filter users by university</label>
          )}
          {showUniversityFilter && (
            <select
              id="user-university-filter"
              value={university}
              onChange={(event) => onUniversityChange(event.target.value)}
              aria-label="Filter users by university"
              className="w-[min(36vw,220px)] max-w-[220px] shrink rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-base text-white outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-900 sm:text-sm"
            >
              <option value="">All universities</option>
              {universities.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
        </div>
      )}
      {showExport && (
        <Button onClick={onExport} className="order-2 ml-auto shrink-0 px-4 xl:order-none xl:ml-0 xl:px-5"><Download size={19}/><span className="hidden sm:inline">Export Data</span><span className="sm:hidden">Export</span></Button>
      )}
      <Suspense fallback={<div className="ml-auto flex h-11 w-11 items-center justify-center text-white"><Bell size={20} /></div>}>
        <AdminNotifications />
      </Suspense>
    </header>
  );
}