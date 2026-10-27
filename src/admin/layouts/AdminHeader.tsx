import { Bell, Download, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Logo from "../../components/shared/Logo";

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700 bg-[#0b1828]/95 px-4 py-3 text-white backdrop-blur sm:min-h-[82px] sm:flex-nowrap sm:gap-3 sm:py-0 sm:px-8">
      <button type="button" onClick={onMenuClick} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white hover:bg-slate-800 lg:hidden">
        <Menu size={24} />
      </button>
      <div className="flex min-w-0 items-center lg:hidden">
        <Logo />
      </div>
      {showSearch && (
        <div className="order-3 flex w-full min-w-0 basis-full items-center gap-2 sm:order-none sm:ml-auto sm:basis-auto sm:max-w-[680px] sm:flex-1">
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
              className="w-[min(36vw,220px)] shrink-0 rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-base text-white outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-900 sm:text-sm"
            >
              <option value="">All universities</option>
              {universities.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
        </div>
      )}
      {showExport && (
        <Button onClick={onExport} className="order-2 ml-auto shrink-0 px-4 sm:order-none sm:ml-0 sm:px-5"><Download size={19}/><span className="hidden sm:inline">Export Data</span><span className="sm:hidden">Export</span></Button>
      )}
      {superAdmin && (
        <div className="relative order-1 ml-auto sm:order-none sm:ml-0">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            aria-controls="admin-notifications"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/40 text-white transition"
          >
            <Bell size={20} />
          </button>
          {notificationsOpen && (
            <section
              id="admin-notifications"
              aria-label="Notifications"
              className="absolute right-0 top-full z-50 mt-3 w-[min(90vw,360px)] rounded-2xl border border-slate-600 bg-[#0c1b2b] p-4 text-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">Staff notifications</h2>
                  <p className="mt-1 text-xs text-slate-400">Attendance activity updates</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  aria-label="Close notifications"
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                >
                  <X size={17} />
                </button>
              </div>
              <p className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-4 text-sm leading-6 text-slate-300">
                Live notifications are not connected yet. Staff clock-in, break, resume, and clock-out events will appear here when the server provides an activity feed.
              </p>
            </section>
          )}
        </div>
      )}
    </header>
  );
}