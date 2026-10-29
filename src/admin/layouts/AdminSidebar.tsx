import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { Home, UsersRound, CircleUserRound, X, CreditCard, University, ReceiptText, UserPlus, LogOut, Pencil, Clock3, KeyRound, Banknote, ChartNoAxesCombined, ShoppingCart, BadgeDollarSign, Mail, Frame } from "lucide-react";
import Logo from "../../components/shared/Logo";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import type { AdminAudience } from "./AdminLayout";
import useToastFeedback from "../../hooks/useToastFeedback";

const links = [
  { label: "My dashboard", href: "/staff/dashboard", Icon: Home },
  { label: "My universities", href: "/staff/universities", Icon: University },
  { label: "Frames", href: "/staff/frames", Icon: Frame },
  { label: "Overview", href: "/admin/dashboard", Icon: Home },
  { label: "Clients", href: "/admin/users", Icon: UsersRound },
  { label: "Accounts", href: "/admin/accounts", Icon: KeyRound },
  { label: "Time track", href: "/admin/attendance", Icon: Clock3 },
  { label: "Universities", href: "/admin/universities", Icon: University },
  { label: "Invoices", href: "/admin/invoices", Icon: ReceiptText },
  { label: "Expenses", href: "/admin/expenses", Icon: Banknote },
  { label: "Email inventory", href: "/admin/emails", Icon: Mail },
  { label: "Reports", href: "/admin/reports", Icon: ChartNoAxesCombined },
  { label: "Staff sales", href: "/admin/staff-sales", Icon: ShoppingCart },
  { label: "Commissions", href: "/admin/commissions", Icon: BadgeDollarSign },
  { label: "Payment plan", href: "/admin/plan", Icon: CreditCard },
  { label: "Staffs management", href: "/admin/admins", Icon: UserPlus },
];

type Props = {
  audience: AdminAudience;
  staffShiftActive: boolean;
  open: boolean;
  onClose: () => void;
};

export default function AdminSidebar({ audience, staffShiftActive, open, onClose }: Props) {
  const admin = useAdminAuthStore((state) => state.admin);
  const superAdmin = audience === "super-admin";
  const miniAdmin = audience === "mini-admin";
  const signOut = useAdminAuthStore((state) => state.signOut);
  // const updateProfile = useAdminAuthStore((state) => state.updateProfile);
  const navigate = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  useToastFeedback(profileError);

  const handleSignOut = () => {
    signOut();
    onClose();
    navigate("/admin/login", { replace: true });
  };

  const startProfileEdit = () => {
    if (!superAdmin) return;
    setProfileName(admin?.name ?? "");
    setProfileEmail(admin?.email ?? "");
    setProfileError("");
    setEditingProfile(true);
    onClose();
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim();
    if (!trimmedName || trimmedName.length > 100) {
      setProfileError("Name must contain non-whitespace text and be at most 100 characters.");
      return;
    }
    if (!trimmedEmail || trimmedEmail.length > 254) {
      setProfileError("Enter an email address of at most 254 characters.");
      return;
    }

    setSavingProfile(true);
    setProfileError("");
    try {
      // await updateProfile({ name: trimmedName, email: trimmedEmail });
      setEditingProfile(false);
    } catch (cause: unknown) {
      setProfileError(cause instanceof Error ? cause.message : "Unable to update your admin details.");
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`admin-sidebar-backdrop fixed inset-0 z-30 bg-slate-900/40 transition-opacity xl:hidden ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      />
      <aside id="admin-sidebar" className={`safe-area-inset-y fixed inset-y-0 left-0 z-40 flex w-[min(85vw,272px)] flex-col overflow-hidden border-r border-slate-700 bg-[#0b1828] px-3 py-6 text-white shadow-xl transition-transform duration-200 xl:z-20 xl:w-[272px] xl:translate-x-0 xl:shadow-none ${open ? "visible translate-x-0" : "invisible -translate-x-full"} xl:visible`}>
        <div className="flex items-center justify-between px-3">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close navigation menu" className="rounded-lg p-2 text-sky-300 hover:bg-blue-50 xl:hidden">
            <X size={22} className="text-sky-300" />
          </button>
        </div>
        <nav aria-label={superAdmin ? "Super admin navigation" : miniAdmin ? "Mini admin navigation" : "Staff navigation"} className="admin-sidebar-nav-scroll mt-10 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-4">
          {links.filter((link) =>
            superAdmin
              ? link.href !== "/admin/attendance" && link.href !== "/staff/dashboard" && link.href !== "/staff/frames"
              : miniAdmin
                ? link.href === "/admin/expenses" || link.href === "/admin/emails"
                : link.href === "/staff/dashboard" ||
                link.href === "/staff/universities" ||
                link.href === "/staff/frames" ||
                link.label === "Commissions" ||
                link.href === "/admin/accounts" ||
                link.href === "/admin/attendance" ||
                (staffShiftActive && link.href === "/admin/users"),
          ).map(({ label, href, Icon }) => (
            <NavLink
              key={href}
              to={!superAdmin && href === "/admin/commissions" ? "/staff/commissions"
                : !superAdmin && href === "/admin/attendance" ? "/staff/attendance"
                : !superAdmin && href === "/admin/users" ? "/staff/users"
                  : href}
              onClick={onClose}
              className={({ isActive }) => `flex items-center gap-5 rounded-xl px-4 py-3.5 text-sm font-semibold transition ${isActive ? "bg-myinder-orange text-white shadow-sm" : "text-slate-200 hover:bg-slate-800"}`}
            >
              <Icon size={23} className="shrink-0 text-sky-300" /> {href === "/admin/accounts" && !superAdmin ? "My Accounts" : label}
            </NavLink>
          ))}
        </nav>
        {superAdmin && (
          <div className="mt-3 border-t border-slate-700 pt-3">
            <NavLink
              to="/admin/frames"
              onClick={onClose}
              className={({ isActive }) => `flex items-center gap-5 rounded-xl px-4 py-3.5 text-sm font-semibold transition ${isActive ? "bg-myinder-orange text-white shadow-sm" : "text-slate-200 hover:bg-slate-800"}`}
            >
              <Frame size={23} className="shrink-0 text-sky-300" /> Frames
            </NavLink>
          </div>
        )}
        <div className="mt-auto border-t border-slate-700 px-3 pt-4">
          <div className="flex items-center gap-3">
            <CircleUserRound size={34} className="h-12 w-12 shrink-0 text-sky-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{admin?.name ?? "Staff"}</p>
              <p className="mt-0.5 truncate text-xs text-slate-300">
                {superAdmin ? "Super admin" : miniAdmin ? "Mini admin" : "Staff"} · {admin?.email ?? "Account"}
              </p>
            </div>
            {superAdmin && (
              <button type="button" onClick={startProfileEdit} aria-label="Edit my admin details" title="Edit my details" className="rounded-lg p-2 text-sky-300 hover:bg-slate-800">
                <Pencil size={17} className="text-sky-300" />
              </button>
            )}
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-sky-300 hover:bg-slate-800">
              <LogOut size={18} className="text-sky-300" />
            </button>
          </div>
        </div>
      </aside>
     {editingProfile && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-profile-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="mb-5">
              <h2 id="admin-profile-title" className="text-lg font-bold text-myinder-navy">Edit my admin details</h2>
              <p className="mt-1 text-sm text-myinder-muted">Update the name and email used for your admin account.</p>
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label htmlFor="admin-profile-name" className="mb-2 block text-sm font-semibold text-myinder-navy">Name</label>
                <Input
                  id="admin-profile-name"
                  autoComplete="name"
                  maxLength={100}
                  required
                  value={profileName}
                  onChange={(event) => {
                    setProfileName(event.target.value);
                    setProfileError("");
                  }}
                />
              </div>
              <div>
                <label htmlFor="admin-profile-email" className="mb-2 block text-sm font-semibold text-myinder-navy">Email</label>
                <Input
                  id="admin-profile-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={profileEmail}
                  onChange={(event) => {
                    setProfileEmail(event.target.value);
                    setProfileError("");
                  }}
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="secondary" onClick={() => setEditingProfile(false)} disabled={savingProfile}>Cancel</Button>
                <Button type="submit" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save details"}</Button>
              </div>
            </form>
          </section>
        </Modal>
      )}
    </>
  );
}