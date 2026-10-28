import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Search, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import {
  createAdmin,
  getAdminById,
  getAdmins,
  getSchools,
  updateAdminSchools,
  type AdminAccount,
  type AdminSchool,
} from "../services/adminAuthService";
import { useAdminAuthStore, isSuperAdmin } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

const MAX_SCHOOL_ASSIGNMENTS = 1000;

function formatAdminSchools(admin: AdminAccount): string {
  if (isSuperAdmin(admin)) return "All schools";
  return admin.schools.length
    ? admin.schools.map((school) => school.name).join(", ")
    : admin.schoolIds.join(", ") || "None assigned";
}

function SchoolCheckboxes({
  schools,
  selectedIds,
  onChange,
  disabled,
  name,
}: {
  schools: AdminSchool[];
  selectedIds: string[];
  onChange: (schoolIds: string[]) => void;
  disabled: boolean;
  name: string;
}) {
  function toggleSchool(id: string, checked: boolean) {
    if (checked) {
      if (selectedIds.length >= MAX_SCHOOL_ASSIGNMENTS) return;
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((schoolId) => schoolId !== id));
    }
  }

  if (!schools.length) {
    return <p className="text-sm text-myinder-muted">No schools are available.</p>;
  }

  return (
    <fieldset disabled={disabled} className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-blue-100 p-3">
      <legend className="sr-only">{name}</legend>
      {schools.map((school) => {
        const checked = selectedIds.includes(school.id);
        return (
          <label key={school.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-myinder-navy hover:bg-blue-50">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => toggleSchool(school.id, event.target.checked)}
              disabled={!checked && selectedIds.length >= MAX_SCHOOL_ASSIGNMENTS}
              className="h-4 w-4 rounded border-blue-300 text-myinder-blue focus:ring-blue-400"
            />
            <span>{school.name}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export default function Admins() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [schoolsError, setSchoolsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  useToastFeedback(actionError || listError || schoolsError, success);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [editSchoolIds, setEditSchoolIds] = useState<string[]>([]);
  const [loadingAdminId, setLoadingAdminId] = useState("");
  const [savingAssignments, setSavingAssignments] = useState(false);
  const adminsRequestId = useRef(0);

  const loadAdmins = useCallback(async (refresh = false) => {
    const requestId = ++adminsRequestId.current;
    if (!accessToken) {
      setListError("Your admin session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setListError("");
    try {
      const result = await getAdmins(accessToken, page, search);
      if (requestId !== adminsRequestId.current) return;
      setAdmins(result.admins);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (cause: unknown) {
      if (requestId !== adminsRequestId.current) return;
      setListError(cause instanceof Error ? cause.message : "Unable to load admins.");
    } finally {
      if (requestId === adminsRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accessToken, page, search]);

  const loadSchools = useCallback(async () => {
    if (!accessToken) {
      setSchoolsError("Your admin session has expired. Please sign in again.");
      setSchoolsLoading(false);
      return;
    }
    setSchoolsLoading(true);
    setSchoolsError("");
    try {
      setSchools(await getSchools(accessToken));
    } catch (cause: unknown) {
      setSchoolsError(cause instanceof Error ? cause.message : "Unable to load schools.");
    } finally {
      setSchoolsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSuccess("");
    if (!name.trim() || name.length > 100) {
      setActionError("Name must contain non-whitespace text and be at most 100 characters.");
      return;
    }
    if (!email.trim() || email.trim().length > 254) {
      setActionError("Enter an email address of at most 254 characters.");
      return;
    }
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setActionError("Password must be 12–128 characters and cannot be all whitespace.");
      return;
    }
    if (schoolIds.length < 1 || schoolIds.length > MAX_SCHOOL_ASSIGNMENTS) {
      setActionError("Select at least one school and no more than 1000.");
      return;
    }
    if (!accessToken) {
      setActionError("Your admin session has expired. Please sign in again.");
      return;
    }

    setCreating(true);
    try {
      const created = await createAdmin({ name, email, password, schoolIds }, accessToken);
      setName("");
      setEmail("");
      setPassword("");
      setSchoolIds([]);
      setPage(1);
      setSearch("");
      setSuccess(`Staff account created for ${created.email}.`);
      setAdmins((current) => [created, ...current.filter((admin) => admin.id !== created.id)]);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to add the admin.");
    } finally {
      setCreating(false);
    }
  }

  async function startEditing(admin: AdminAccount) {
    if (!accessToken) return;
    setActionError("");
    setSuccess("");
    setLoadingAdminId(admin.id);
    try {
      const current = await getAdminById(admin.id, accessToken);
      if (isSuperAdmin(current)) {
        setActionError("Super admins have access to all schools and do not need assignments.");
        return;
      }
      setEditing(current);
      setEditSchoolIds(current.schoolIds);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to load admin details.");
    } finally {
      setLoadingAdminId("");
    }
  }

  async function handleSaveAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    if (!editing || !accessToken) {
      setActionError("Your admin session has expired. Please sign in again.");
      return;
    }
    if (editSchoolIds.length < 1 || editSchoolIds.length > MAX_SCHOOL_ASSIGNMENTS) {
      setActionError("Select at least one school and no more than 1000.");
      return;
    }
    setSavingAssignments(true);
    try {
      const updated = await updateAdminSchools(editing.id, editSchoolIds, accessToken);
      setAdmins((current) => current.map((admin) => admin.id === updated.id ? updated : admin));
      setSuccess(`Updated school assignments for ${updated.email}.`);
      setEditing(null);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update school assignments.");
    } finally {
      setSavingAssignments(false);
    }
  }

  async function refreshLists() {
    await Promise.all([loadAdmins(true), loadSchools()]);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Administration</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Manage staff</h1>
          <p className="mt-2 text-sm text-slate-300">
            Create staff accounts, assign their schools, and manage their access.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refreshLists()} disabled={refreshing || schoolsLoading}>
          <RefreshCw size={17} className={refreshing || schoolsLoading ? "animate-spin" : ""} />
          {refreshing || schoolsLoading ? "Refreshing..." : "Refresh list"}
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-myinder-blue">
              <Users size={20} />
            </span>
            <div>
              <h2 className="font-bold text-myinder-navy">Admin accounts</h2>
              <p className="text-xs text-myinder-muted">Page {page} of {totalPages}</p>
            </div>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-myinder-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search name or email"
              aria-label="Search staff or super admins"
              className="w-full rounded-xl border border-blue-100 bg-white py-2.5 pl-10 pr-3 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
            />
          </label>
        </div>

        {listError ? (
          <div className="p-8 text-center">
            <Button type="button" variant="secondary" onClick={() => void loadAdmins(true)} disabled={refreshing} className="mt-4">
              Try again
            </Button>
          </div>
        ) : loading ? (
          <p className="p-8 text-center text-sm text-myinder-muted">Loading administrators...</p>
        ) : admins.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 font-semibold text-myinder-navy">
              {search ? "No admins match your search" : "No administrator accounts yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Administrator</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Assigned schools</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {admins.map((admin) => {
                    const superAdmin = isSuperAdmin(admin);
                    return (
                      <tr key={admin.id} className="hover:bg-blue-50/40">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-myinder-navy">{admin.name}</p>
                          <p className="mt-1 text-myinder-muted">{admin.email}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${superAdmin ? "bg-orange-50 text-orange-800" : "bg-blue-50 text-blue-800"}`}>
                            {superAdmin ? "Super admin" : "Staff"}
                          </span>
                        </td>
                        <td className="max-w-sm px-5 py-4 text-myinder-muted">{formatAdminSchools(admin)}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            {!superAdmin && (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => void startEditing(admin)}
                                disabled={loadingAdminId === admin.id}
                              >
                                <Pencil size={15} />
                                {loadingAdminId === admin.id ? "Loading..." : "Manage schools"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-blue-50 px-5 py-4">
                <Button type="button" variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>
                  Previous
                </Button>
                <span className="text-sm text-myinder-muted">Page {page} of {totalPages}</span>
                <Button type="button" variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <form onSubmit={handleCreate} className="space-y-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3 border-b border-blue-50 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-myinder-orange">
            <Plus size={22} />
          </div>
          <div>
            <h2 className="font-bold text-myinder-navy">Add staff</h2>
            <p className="mt-1 text-sm text-myinder-muted">New accounts only receive access to the selected schools.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="new-admin-name" className="mb-2 block text-sm font-semibold text-myinder-navy">Full name</label>
            <Input id="new-admin-name" type="text" autoComplete="name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Site Administrator" />
          </div>
          <div>
            <label htmlFor="new-admin-email" className="mb-2 block text-sm font-semibold text-myinder-navy">Email address</label>
            <Input id="new-admin-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
          </div>
          <div>
            <label htmlFor="new-admin-password" className="mb-2 block text-sm font-semibold text-myinder-navy">Password</label>
            <div className="relative">
              <Input
                id="new-admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Use 12–128 characters"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-2 flex items-center justify-center rounded-lg px-2 text-myinder-muted transition hover:bg-blue-50 hover:text-myinder-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-myinder-muted">Passwords must be 12–128 characters and cannot be all whitespace.</p>
          </div>
          <div className="md:row-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-myinder-navy">Assigned schools</label>
              <span className="text-xs text-myinder-muted">{schoolIds.length} selected</span>
            </div>
            {schoolsError ? null : schoolsLoading ? (
              <p className="text-sm text-myinder-muted">Loading schools...</p>
            ) : (
              <SchoolCheckboxes
                name="Schools for new admin"
                schools={schools}
                selectedIds={schoolIds}
                onChange={setSchoolIds}
                disabled={creating}
              />
            )}
            <p className="mt-2 text-xs text-myinder-muted">Select at least one school (maximum 1000).</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-blue-50 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-myinder-muted">Passwords are never shown again after account creation.</p>
          <Button type="submit" disabled={creating || schoolsLoading || Boolean(schoolsError) || schools.length === 0}>
            <Plus size={17} />{creating ? "Creating admin..." : "Create admin"}
          </Button>
        </div>
      </form>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAssignments) setEditing(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-admin-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5">
              <h2 id="edit-admin-title" className="text-lg font-bold text-myinder-navy">Manage school assignments</h2>
              <p className="mt-1 text-sm text-myinder-muted">{editing.name} · {editing.email}</p>
            </div>
            <form onSubmit={handleSaveAssignments} className="space-y-5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-myinder-navy">Schools</label>
                <span className="text-xs text-myinder-muted">{editSchoolIds.length} selected</span>
              </div>
              <SchoolCheckboxes
                name={`Schools assigned to ${editing.name}`}
                schools={schools}
                selectedIds={editSchoolIds}
                onChange={setEditSchoolIds}
                disabled={savingAssignments}
              />
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={savingAssignments}>Cancel</Button>
                <Button type="submit" disabled={savingAssignments}>
                  {savingAssignments ? "Saving..." : "Save assignments"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
