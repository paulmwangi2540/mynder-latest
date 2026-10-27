import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { Home, UsersRound, CircleUserRound, X, CreditCard, University, ReceiptText, UserPlus, LogOut, Pencil } from "lucide-react";
import Logo from "../../components/shared/Logo";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import ColorfulIcon from "../components/ColorfulIcon";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import type { AdminAudience } from "./AdminLayout";

const links = [
  { label: "Overview", href: "/admin/dashboard", Icon: Home, tone: "blue" as const },
  { label: "Users", href: "/admin/users", Icon: UsersRound, tone: "purple" as const },
  { label: "Universities", href: "/admin/universities", Icon: University, tone: "orange" as const },
  { label: "Invoices", href: "/admin/invoices", Icon: ReceiptText, tone: "green" as const },
  { label: "Payment plan", href: "/admin/plan", Icon: CreditCard, tone: "green" as const },
  { label: "Admins", href: "/admin/admins", Icon: UserPlus, tone: "purple" as const },
];

type Props = { audience: AdminAudience; open: boolean; onClose: () => void };

export default function AdminSidebar({ audience, open, onClose }: Props) {
  const admin = useAdminAuthStore((state) => state.admin);
  const superAdmin = audience === "super-admin";
  const signOut = useAdminAuthStore((state) => state.signOut);
  const updateProfile = useAdminAuthStore((state) => state.updateProfile);
  const navigate = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSignOut = () => {
    signOut();
    onClose();
    navigate("/admin/login", { replace: true });
  };

  const startProfileEdit = () => {
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
      await updateProfile({ name: trimmedName, email: trimmedEmail });
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
        className={`fixed inset-0 z-30 bg-slate-900/40 transition-opacity lg:hidden ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      />
      <aside id="admin-sidebar" className={`safe-area-inset-y fixed inset-y-0 left-0 z-40 flex w-[min(85vw,272px)] flex-col border-r border-slate-700 bg-[#0b1828] px-3 py-6 text-white shadow-xl transition-transform duration-200 lg:z-20 lg:w-[272px] lg:translate-x-0 lg:shadow-none ${open ? "visible translate-x-0" : "invisible -translate-x-full"} lg:visible`}>
        <div className="flex items-center justify-between px-3">
          <Logo admin />
          <button type="button" onClick={onClose} aria-label="Close navigation menu" className="rounded-lg p-2 text-myinder-navy hover:bg-blue-50 lg:hidden">
            <X size={22} />
          </button>
        </div>
        <nav aria-label={superAdmin ? "Super admin navigation" : "Staff navigation"} className="mt-10 space-y-2">
          {links.filter((link) => superAdmin || link.href === "/admin/users").map(({ label, href, Icon, tone }) => (
            <NavLink key={href} to={href} onClick={onClose} className={({ isActive }) => `flex items-center gap-5 rounded-xl px-4 py-3.5 text-sm font-semibold transition ${isActive ? "bg-myinder-orange text-white shadow-sm" : "text-slate-200 hover:bg-slate-800"}`}>
              <ColorfulIcon Icon={Icon} tone={tone} size={23} badge={false} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-700 px-3 pt-4">
          <div className="flex items-center gap-3">
            <ColorfulIcon Icon={CircleUserRound} tone="blue" size={34} className="h-12 w-12 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{admin?.name ?? "Staff"}</p>
              <p className="mt-0.5 truncate text-xs text-slate-300">
                {superAdmin ? "Super admin" : "Staff"} · {admin?.email ?? "Account"}
              </p>
            </div>
            <button type="button" onClick={startProfileEdit} aria-label="Edit my admin details" title="Edit my details" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
              <Pencil size={17} />
            </button>
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
              <LogOut size={18} />
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
              {profileError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{profileError}</p>}
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