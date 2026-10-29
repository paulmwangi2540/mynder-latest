import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Mail, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import useToastFeedback from "../../hooks/useToastFeedback";
import {
  assignEmailRecord,
  createEmailRecord,
  deleteEmailRecord,
  getEmailStaff,
  getEmailRecord,
  getEmailRecords,
  getMyEmailRecords,
  updateEmailRecord,
  type EmailRecord,
  type EmailRecordInput,
} from "../services/emailInventoryService";
import { isMiniAdmin, isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

const EMAILS_PER_PAGE = 20;

interface EmailFormState {
  email: string;
  used: boolean;
  used_on_tiktok: boolean;
  used_on_instagram: boolean;
  assigned_to: string | null;
}

const EMPTY_FORM: EmailFormState = {
  email: "",
  used: false,
  used_on_tiktok: false,
  used_on_instagram: false,
  assigned_to: null,
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Date unavailable";
}

function filterValue(value: string): boolean | undefined {
  return value === "" ? undefined : value === "true";
}

function Flag({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${checked ? "bg-emerald-600 text-white" : "bg-slate-600 text-white"}`}>
      {label}: {checked ? "Yes" : "No"}
    </span>
  );
}

function EmailFlags({ record }: { record: EmailRecord }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Flag label="Used" checked={record.used} />
      <Flag label="TikTok" checked={record.used_on_tiktok} />
      <Flag label="Instagram" checked={record.used_on_instagram} />
    </div>
  );
}

export default function EmailInventory() {
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = isSuperAdmin(admin) || isMiniAdmin(admin);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [assignmentFilter, setAssignmentFilter] = useState<"" | "true" | "false">("");
  const [search, setSearch] = useState("");
  const [used, setUsed] = useState("");
  const [usedOnTiktok, setUsedOnTiktok] = useState("");
  const [usedOnInstagram, setUsedOnInstagram] = useState("");
  const [editing, setEditing] = useState<EmailRecord | null | undefined>(undefined);
  const [form, setForm] = useState<EmailFormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<EmailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const emailQuery = useQuery({
    queryKey: [
      "admin-email-inventory",
      adminId ?? "",
      page,
      canManage,
      assignmentFilter,
      search,
      used,
      usedOnTiktok,
      usedOnInstagram,
    ],
    queryFn: () => {
      const filters = {
        page,
        limit: EMAILS_PER_PAGE,
        search,
        used: filterValue(used),
        used_on_tiktok: filterValue(usedOnTiktok),
        used_on_instagram: filterValue(usedOnInstagram),
      };
      return canManage
        ? getEmailRecords({ ...filters, assigned: assignmentFilter === "" ? undefined : assignmentFilter === "true" })
        : getMyEmailRecords(filters);
    },
    enabled: Boolean(adminId),
    staleTime: 30_000,
  });

  const staffQuery = useQuery({
    queryKey: ["admin-email-staff", adminId ?? ""],
    queryFn: () => getEmailStaff({ limit: 100 }),
    enabled: Boolean(adminId && canManage),
    staleTime: 60_000,
  });

  const assignedCountQuery = useQuery({
    queryKey: ["admin-email-assignment-count", adminId ?? "", "assigned", search, used, usedOnTiktok, usedOnInstagram],
    queryFn: () => getEmailRecords({
      page: 1,
      limit: 1,
      search,
      used: filterValue(used),
      used_on_tiktok: filterValue(usedOnTiktok),
      used_on_instagram: filterValue(usedOnInstagram),
      assigned: true,
    }),
    enabled: Boolean(adminId && canManage),
    staleTime: 30_000,
  });

  const unassignedCountQuery = useQuery({
    queryKey: ["admin-email-assignment-count", adminId ?? "", "unassigned", search, used, usedOnTiktok, usedOnInstagram],
    queryFn: () => getEmailRecords({
      page: 1,
      limit: 1,
      search,
      used: filterValue(used),
      used_on_tiktok: filterValue(usedOnTiktok),
      used_on_instagram: filterValue(usedOnInstagram),
      assigned: false,
    }),
    enabled: Boolean(adminId && canManage),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!emailQuery.data) return;
    const lastPage = Math.max(1, emailQuery.data.total_pages);
    if (page > lastPage) setPage(lastPage);
  }, [emailQuery.data, page]);

  useToastFeedback(actionError || emailQuery.error?.message || "", notice);

  const staff = staffQuery.data ?? [];
  function staffName(assignedTo: string | null): string {
    if (!assignedTo) return "Unassigned";
    const assignee = staff.find((member) => member.id === assignedTo);
    return assignee ? `${assignee.name} (${assignee.email})` : `Staff member (${assignedTo})`;
  }

  function startCreate() {
    setActionError("");
    setNotice("");
    setForm(EMPTY_FORM);
    setEditing(null);
  }

  function startEdit(record: EmailRecord) {
    if (!canManage) return;
    setActionError("");
    setNotice("");
    setForm({
      email: record.email,
      used: record.used,
      used_on_tiktok: record.used_on_tiktok,
      used_on_instagram: record.used_on_instagram,
      assigned_to: record.assigned_to,
    });
    setEditing(record);
  }

  async function showDetails(id: string) {
    setActionError("");
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getEmailRecord(id));
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to load the email record.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setSaving(true);
    try {
      const input: EmailRecordInput = {
        email: form.email.trim(),
        used: form.used,
        used_on_tiktok: form.used_on_tiktok,
        used_on_instagram: form.used_on_instagram,
        assigned_to: form.assigned_to,
      };
      if (editing) {
        await updateEmailRecord(editing.id, input);
        setNotice("Email record updated.");
      } else {
        await createEmailRecord(input);
        setPage(1);
        setNotice("Email record created.");
      }
      setEditing(undefined);
      await invalidateEmailQueries();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to save the email record.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: EmailRecord) {
    if (!window.confirm(`Delete the email record for ${record.email}? This cannot be undone.`)) return;
    setActionError("");
    setNotice("");
    try {
      await deleteEmailRecord(record.id);
      setNotice(`Deleted ${record.email}.`);
      setDetail(null);
      await invalidateEmailQueries();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete the email record.");
    }
  }

  async function saveAssignment(record: EmailRecord, assignedTo: string | null) {
    setActionError("");
    setNotice("");
    try {
      const updated = await assignEmailRecord(record.id, assignedTo);
      setDetail(updated);
      setNotice(assignedTo ? "Email assigned to staff member." : "Email unassigned.");
      await invalidateEmailQueries();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update the email assignment.");
    }
  }

  async function invalidateEmailQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-email-inventory", adminId ?? ""] }),
      queryClient.invalidateQueries({ queryKey: ["admin-email-assignment-count", adminId ?? ""] }),
    ]);
  }

  const records = emailQuery.data?.items ?? [];
  const totalPages = emailQuery.data?.total_pages ?? 0;
  const busy = emailQuery.isFetching;
  const flagFilters = [
    { label: "Used", value: used, onChange: setUsed },
    { label: "Used on TikTok", value: usedOnTiktok, onChange: setUsedOnTiktok },
    { label: "Used on Instagram", value: usedOnInstagram, onChange: setUsedOnInstagram },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Shared inventory</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Email records</h1>
          <p className="mt-1 text-sm text-slate-300">
            Track shared email addresses and their independent usage flags. Records do not create mailboxes or send email.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button type="button" onClick={startCreate}>
            <Plus size={17} /> Add email
          </Button>}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void emailQuery.refetch()}
            disabled={busy}
          >
            <RefreshCw size={17} className={busy ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#102237] p-4 sm:p-5">
        {canManage && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Email assignment filter">
            {([
              { value: "", label: "All emails", count: undefined },
              { value: "true", label: "Assigned", count: assignedCountQuery.data?.total },
              { value: "false", label: "Unassigned", count: unassignedCountQuery.data?.total },
            ] as const).map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={assignmentFilter === tab.value}
                onClick={() => {
                  setPage(1);
                  setAssignmentFilter(tab.value);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${assignmentFilter === tab.value ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {tab.label}{tab.count === undefined ? "" : ` (${tab.count})`}
              </button>
            ))}
          </div>
        )}
        {canManage && staffQuery.error && (
          <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            Unable to load the staff assignment list: {staffQuery.error.message}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative block">
            <span className="sr-only">Search email addresses</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search email address"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 py-2.5 pl-10 pr-3 text-base text-white outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-900 sm:text-sm"
            />
          </label>
          {flagFilters.map(({ label, value, onChange }) => (
            <label key={label} className="block">
              <span className="sr-only">{label} filter</span>
              <select
                value={value}
                onChange={(event) => {
                  setPage(1);
                  onChange(event.target.value);
                }}
                aria-label={`${label} filter`}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-white outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-900 sm:text-sm"
              >
                <option value="">All {label.toLowerCase()} values</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          ))}
        </div>

        {emailQuery.isPending ? (
          <LoadingState label="Loading email records..." />
        ) : emailQuery.error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-6 text-center text-sm text-red-200">
            Unable to load email records. Refresh the list or try again.
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={() => void emailQuery.refetch()}>Try again</Button>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-slate-700 p-10 text-center">
            <Mail size={30} className="mx-auto text-slate-500" />
            <p className="mt-3 font-semibold text-white">{search ? "No email records match these filters." : "No email records yet."}</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-700 rounded-xl border border-slate-700 sm:hidden">
              {records.map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-bold text-white">{record.email}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(record.created_at)}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">Assigned to: {staffName(record.assigned_to)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void showDetails(record.id)}
                    aria-label={`View ${record.email}`}
                    className="shrink-0"
                  >
                    <Eye size={16} /> View
                  </Button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border border-slate-700 sm:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Email address</th>
                    <th className="px-4 py-3">Usage flags</th>
                    <th className="px-4 py-3">Assigned to</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {records.map((record) => (
                    <tr key={record.id} className="text-slate-200">
                      <td className="px-4 py-4 font-semibold text-white">{record.email}</td>
                      <td className="px-4 py-4"><EmailFlags record={record} /></td>
                      <td className="px-4 py-4 text-slate-300">{staffName(record.assigned_to)}</td>
                      <td className="px-4 py-4 text-slate-400">{formatDate(record.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => void showDetails(record.id)} aria-label={`View ${record.email}`}>
                            <Eye size={16} /><span className="sr-only">View</span>
                          </Button>
                          {canManage && <>
                            <Button type="button" variant="secondary" onClick={() => startEdit(record)} aria-label={`Edit ${record.email}`}>
                              <Pencil size={16} /><span className="sr-only">Edit</span>
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => void removeRecord(record)} aria-label={`Delete ${record.email}`}>
                              <Trash2 size={16} /><span className="sr-only">Delete</span>
                            </Button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="flex items-center justify-between gap-3 text-sm text-slate-300">
          <span>{emailQuery.data?.total ?? 0} records · Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || busy}>Previous</Button>
            <Button type="button" variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={totalPages === 0 || page >= totalPages || busy}>Next</Button>
          </div>
        </footer>
      </section>

      {editing !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="email-form-title" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-white p-5 shadow-2xl sm:p-7">
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="email-form-title" className="text-xl font-bold text-myinder-navy">{editing ? "Edit email record" : "Add email record"}</h2>
                <p className="mt-1 text-sm text-myinder-muted">Each usage flag is independent and can be changed separately.</p>
              </div>
              <button type="button" onClick={() => setEditing(undefined)} aria-label="Close form" className="rounded-lg p-2 text-myinder-muted hover:bg-blue-50"><X size={20} /></button>
            </header>
            <form onSubmit={saveRecord} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  disabled={saving}
                  className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
                />
              </label>
              {canManage && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Assigned staff</span>
                  <select
                    value={form.assigned_to ?? ""}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      assigned_to: event.target.value || null,
                    }))}
                    disabled={saving || staffQuery.isPending}
                    className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>{member.name} ({member.email}) · {member.role}</option>
                    ))}
                    {form.assigned_to && !staff.some((member) => member.id === form.assigned_to) && (
                      <option value={form.assigned_to}>Current assignee ({form.assigned_to})</option>
                    )}
                  </select>
                  {staffQuery.error && <span className="mt-1 block text-xs text-red-600">Unable to load staff picker: {staffQuery.error.message}</span>}
                </label>
              )}
              <fieldset disabled={saving} className="space-y-3 rounded-xl border border-blue-100 p-4">
                <legend className="px-1 text-sm font-semibold text-myinder-navy">Usage flags</legend>
                {([
                  ["used", "Used"],
                  ["used_on_tiktok", "Used on TikTok"],
                  ["used_on_instagram", "Used on Instagram"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-3 text-sm text-myinder-navy">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))}
                      className="h-4 w-4 rounded border-blue-300 text-myinder-blue focus:ring-blue-400"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col-reverse gap-3 border-t border-blue-50 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditing(undefined)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Create email record"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="email-detail-title" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#102237] p-5 shadow-2xl sm:p-7">
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Email inventory record</p>
                <h2 id="email-detail-title" className="mt-1 break-all text-xl font-bold text-white">{detail?.email ?? "Loading record..."}</h2>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close details" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20} /></button>
            </header>
            {detail ? (
              <>
                <dl className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div><dt className="text-xs font-semibold uppercase text-slate-400">ID</dt><dd className="mt-1 break-all text-sm text-white">{detail.id}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-400">Flags</dt><dd className="mt-2"><EmailFlags record={detail} /></dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-400">Assigned to</dt><dd className="mt-1 text-sm text-white">{staffName(detail.assigned_to)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-400">Created</dt><dd className="mt-1 text-sm text-white">{formatDate(detail.created_at)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-400">Updated</dt><dd className="mt-1 text-sm text-white">{formatDate(detail.updated_at)}</dd></div>
                </dl>
                {canManage && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-200">Reassign email</span>
                    <select
                      value={detail.assigned_to ?? ""}
                      onChange={(event) => void saveAssignment(detail, event.target.value || null)}
                      disabled={staffQuery.isPending}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">Unassigned</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name} ({member.email}) · {member.role}</option>
                      ))}
                      {detail.assigned_to && !staff.some((member) => member.id === detail.assigned_to) && (
                        <option value={detail.assigned_to}>Current assignee ({detail.assigned_to})</option>
                      )}
                    </select>
                    {staffQuery.error && <span className="mt-1 block text-xs text-rose-300">Unable to load staff picker: {staffQuery.error.message}</span>}
                  </label>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {canManage && <>
                    <Button type="button" variant="secondary" onClick={() => { startEdit(detail); setDetail(null); }}><Pencil size={16} /> Edit</Button>
                    <Button type="button" variant="secondary" onClick={() => void removeRecord(detail)}><Trash2 size={16} /> Delete</Button>
                  </>}
                  <Button type="button" variant="secondary" onClick={() => setDetail(null)}>Close</Button>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-300">Loading email details...</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
