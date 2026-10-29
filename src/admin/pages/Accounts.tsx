import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw, Search, Trash2, Upload, UsersRound, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import Pagination from "../components/Pagination";
import {
  createAccount,
  deleteAccount,
  getAccount,
  getAccounts,
  importAccounts,
  ACCOUNT_STATUSES,
  updateAccount,
  type AccountFields,
  type ManagedAccount,
} from "../services/accountsService";
import { getAdmins, type AdminAccount } from "../services/adminAuthService";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

const PAGE_SIZE = 20;
const EMPTY_FIELDS: AccountFields = {
  university: "",
  handle: "",
  status: "setup",
  verified: false,
  email: "",
  emailPassword: "",
  accountPassword: "",
  emailRecoveryNo: "",
  accountRecoveryNo: "",
  followers: "",
};

const ACCOUNT_STATUS_LABELS: Record<(typeof ACCOUNT_STATUSES)[number], string> = {
  done: "Done",
  closed: "Closed",
  setup: "Set up",
  appealing: "Appealing",
  followers: "Followers",
};

function validateAccount(fields: AccountFields): string {
  if (!fields.university.trim() || fields.university.trim().length > 200) {
    return "University is required and must be at most 200 characters.";
  }
  if (!fields.handle.trim() || fields.handle.trim().length > 150) {
    return "Handle is required and must be at most 150 characters.";
  }
  if (fields.email.length > 320) return "Email must be at most 320 characters.";
  if (fields.emailPassword.length > 1024 || fields.accountPassword.length > 1024) {
    return "Passwords must be at most 1024 characters.";
  }
  if (
    fields.emailRecoveryNo.length > 100 ||
    fields.accountRecoveryNo.length > 100 ||
    fields.followers.length > 100
  ) {
    return "Recovery numbers and followers must be at most 100 characters.";
  }
  return "";
}

function AccountField({
  label,
  value,
  onChange,
  maxLength,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
  type?: "text" | "email" | "password";
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">
        {label}{required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required={required}
        className="w-full min-w-0 rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
      />
    </label>
  );
}

function SecretValue({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`flex items-center gap-1.5 ${compact ? "min-w-0" : "min-w-32"}`}>
      <span className="min-w-0 truncate font-mono text-xs text-myinder-navy">
        {value ? (visible ? value : "••••••••") : "—"}
      </span>
      {value && (
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Hide" : "Reveal"} ${label}`}
          title={`${visible ? "Hide" : "Reveal"} ${label}`}
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

function VerificationBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        verified
          ? "bg-emerald-100 text-emerald-800"
          : "bg-rose-100 text-rose-700"
      }`}
    >
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}

export default function Accounts() {
  const admin = useAdminAuthStore((state) => state.admin);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const superAdmin = isSuperAdmin(admin);
  const [items, setItems] = useState<ManagedAccount[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [adminFilter, setAdminFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  useToastFeedback(actionError || listError, success);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedAccount | null>(null);
  const [detailsAccount, setDetailsAccount] = useState<ManagedAccount | null>(null);
  const [fields, setFields] = useState<AccountFields>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [loadingAccountId, setLoadingAccountId] = useState("");
  const [importText, setImportText] = useState("");
  const [skipExisting, setSkipExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const accountsRequestId = useRef(0);

  useEffect(() => {
    if (!detailsAccount) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsAccount(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [detailsAccount]);

  const loadAccounts = useCallback(async (refresh = false) => {
    const requestId = ++accountsRequestId.current;
    const staffAdminId = admin?.id;
    if (!accessToken) {
      setListError("Your admin session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    if (!superAdmin && !staffAdminId) {
      setListError("Unable to identify your staff account. Please sign in again.");
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setListError("");
    try {
      const result = await getAccounts({
        page,
        limit: PAGE_SIZE,
        search,
        adminId: superAdmin ? adminFilter || undefined : undefined,
        status: ACCOUNT_STATUSES.find((status) => status === statusFilter),
        verified: verifiedFilter === "" ? undefined : verifiedFilter === "true",
      });
      if (requestId !== accountsRequestId.current) return;
      setItems(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (cause: unknown) {
      if (requestId !== accountsRequestId.current) return;
      setListError(cause instanceof Error ? cause.message : "Unable to load managed accounts.");
    } finally {
      if (requestId === accountsRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accessToken, admin?.id, adminFilter, page, search, statusFilter, verifiedFilter, superAdmin]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    let active = true;
    async function loadAdminOptions() {
      if (!superAdmin || !accessToken) return;
      try {
        const firstPage = await getAdmins(accessToken, 1, "");
        const allAdmins = [...firstPage.admins];
        for (let currentPage = 2; currentPage <= firstPage.totalPages; currentPage += 1) {
          const result = await getAdmins(accessToken, currentPage, "");
          allAdmins.push(...result.admins);
        }
        if (active) setAdmins(allAdmins.filter((item) => !isSuperAdmin(item)));
      } catch (cause: unknown) {
        if (active) {
          setActionError(cause instanceof Error ? cause.message : "Unable to load staff owners.");
        }
      }
    }
    void loadAdminOptions();
    return () => { active = false; };
  }, [accessToken, superAdmin]);

  function openCreate() {
    setEditing(null);
    setFields(EMPTY_FIELDS);
    setOwnerId(adminFilter);
    setActionError("");
    setEditorOpen(true);
  }

  async function openEdit(account: ManagedAccount) {
    setActionError("");
    if (!accessToken) {
      setActionError("Your admin session has expired. Please sign in again.");
      return;
    }
    setLoadingAccountId(account.id);
    try {
      const details = await getAccount(account.id);
      setEditing(details);
      setFields({
        university: details.university,
        handle: details.handle,
        status: details.status,
        verified: details.verified,
        email: details.email,
        emailPassword: details.emailPassword,
        accountPassword: details.accountPassword,
        emailRecoveryNo: details.emailRecoveryNo,
        accountRecoveryNo: details.accountRecoveryNo,
        followers: details.followers,
      });
      setOwnerId(details.adminId);
      setEditorOpen(true);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to load account details.");
    } finally {
      setLoadingAccountId("");
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSuccess("");
    const validationError = validateAccount(fields);
    if (validationError) {
      setActionError(validationError);
      return;
    }
    if (!accessToken) {
      setActionError("Your admin session has expired. Please sign in again.");
      return;
    }
    if (superAdmin && !ownerId) {
      setActionError("Select the staff member who owns this account.");
      return;
    }

    setSaving(true);
    try {
      if (editing) await updateAccount(editing.id, fields, superAdmin ? ownerId : undefined);
      else await createAccount(fields, superAdmin ? ownerId : undefined);
      setEditorOpen(false);
      setSuccess(editing ? "Account updated." : "Account created.");
      await loadAccounts(true);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to save the account.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount(account: ManagedAccount) {
    if (!window.confirm(`Delete the ${account.handle} account? This cannot be undone.`)) return;
    setActionError("");
    setSuccess("");
    try {
      await deleteAccount(account.id);
      setSuccess(`Deleted ${account.handle}.`);
      await loadAccounts(true);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete the account.");
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSuccess("");
    if (superAdmin && !ownerId) {
      setActionError("Select the staff member who will own the imported accounts.");
      return;
    }
    let rows: unknown;
    try {
      rows = JSON.parse(importText) as unknown;
    } catch {
      setActionError("Enter valid JSON containing an array of account rows.");
      return;
    }
    if (!Array.isArray(rows)) {
      setActionError("Import data must be a JSON array of account rows.");
      return;
    }
    setImporting(true);
    try {
      const result = await importAccounts({
        rows,
        skipExisting,
        ...(superAdmin ? { adminId: ownerId } : {}),
      });
      setImportText("");
      setShowImport(false);
      setSuccess(`Import complete: ${result.imported} imported, ${result.skipped} skipped.`);
      await loadAccounts(true);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to import accounts.");
    } finally {
      setImporting(false);
    }
  }

  const ownerSelect = (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Assigned staff *</span>
      <select
        required
        value={ownerId}
        onChange={(event) => setOwnerId(event.target.value)}
        className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
      >
        <option value="">Select staff</option>
        {admins.map((item) => (
          <option key={item.id} value={item.id}>{item.name} · {item.email}</option>
        ))}
      </select>
    </label>
  );
  const visibleItems = items.filter((account) =>
    (!statusFilter || account.status === statusFilter) &&
    (verifiedFilter === "" || account.verified === (verifiedFilter === "true")),
  );

  return (
    <main className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            {superAdmin ? "Administration" : "Staff workspace"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            {superAdmin ? "Accounts" : "My Accounts"}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            {superAdmin
              ? "Manage staff-owned account records, credentials, and assignments."
              : "Create and manage the account records assigned to you."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void loadAccounts(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
          {superAdmin && (
            <>
              <Button variant="secondary" onClick={() => { setShowImport((open) => !open); setActionError(""); }}>
                <Upload size={16} /> Import JSON
              </Button>
            </>
          )}
          <Button onClick={openCreate}><Plus size={17} /> Add account</Button>
        </div>
      </div>

      {superAdmin && showImport && (
        <form onSubmit={handleImport} className="space-y-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-myinder-navy">Import account records</h2>
              <p className="mt-1 text-sm text-myinder-muted">Paste a JSON array of account objects (1–1000 rows). The import is atomic.</p>
            </div>
            <button type="button" aria-label="Close import form" onClick={() => setShowImport(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
          {superAdmin && ownerSelect}
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">JSON rows</span>
            <textarea
              required
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={7}
              spellCheck={false}
              placeholder={'[{"university":"Example University","handle":"example2031","accountPassword":"..."}]'}
              className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 font-mono text-sm text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-myinder-navy">
            <input type="checkbox" checked={skipExisting} onChange={(event) => setSkipExisting(event.target.checked)} className="h-4 w-4 rounded border-blue-300" />
            Skip duplicate handles without overwriting existing accounts
          </label>
          <Button type="submit" disabled={importing}>
            <Upload size={16} /> {importing ? "Importing..." : "Import accounts"}
          </Button>
        </form>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="account-editor-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="account-editor-title" className="text-xl font-bold text-myinder-navy">{editing ? "Edit account" : "Add account"}</h2>
                <p className="mt-1 text-sm text-myinder-muted">Original credentials are returned only to authorized admins and are not cached by this page.</p>
              </div>
              <button type="button" aria-label="Close account form" onClick={() => setEditorOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={saveAccount} className="space-y-5">
              {superAdmin && ownerSelect}
              <div className="grid gap-4 sm:grid-cols-2">
                <AccountField label="University" value={fields.university} onChange={(university) => setFields((current) => ({ ...current, university }))} maxLength={200} required />
                <AccountField label="Handle" value={fields.handle} onChange={(handle) => setFields((current) => ({ ...current, handle }))} maxLength={150} required />
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Status</span>
                  <select
                    value={fields.status}
                    onChange={(event) => {
                      const status = ACCOUNT_STATUSES.find((candidate) => candidate === event.target.value);
                      if (status) setFields((current) => ({ ...current, status }));
                    }}
                    className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
                  >
                    {ACCOUNT_STATUSES.map((status) => (
                      <option key={status} value={status}>{ACCOUNT_STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-myinder-navy">
                  <input
                    type="checkbox"
                    checked={fields.verified}
                    onChange={(event) => setFields((current) => ({ ...current, verified: event.target.checked }))}
                    className="h-4 w-4 rounded border-blue-300"
                  />
                  Verified
                </label>
                <AccountField label="Email" type="email" value={fields.email} onChange={(email) => setFields((current) => ({ ...current, email }))} maxLength={320} />
                <AccountField label="Email password" type="password" value={fields.emailPassword} onChange={(emailPassword) => setFields((current) => ({ ...current, emailPassword }))} maxLength={1024} />
                <AccountField label="Account password" type="password" value={fields.accountPassword} onChange={(accountPassword) => setFields((current) => ({ ...current, accountPassword }))} maxLength={1024} />
                <AccountField label="Email recovery number" value={fields.emailRecoveryNo} onChange={(emailRecoveryNo) => setFields((current) => ({ ...current, emailRecoveryNo }))} maxLength={100} />
                <AccountField label="Account recovery number" value={fields.accountRecoveryNo} onChange={(accountRecoveryNo) => setFields((current) => ({ ...current, accountRecoveryNo }))} maxLength={100} />
                <AccountField label="Followers" value={fields.followers} onChange={(followers) => setFields((current) => ({ ...current, followers }))} maxLength={100} />
              </div>
              <div className="flex justify-end gap-2 border-t border-blue-50 pt-4">
                <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Create account"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-myinder-blue"><KeyRound size={20} /></span>
            <div>
              <h2 className="font-bold text-myinder-navy">Account records</h2>
              <p className="text-xs text-myinder-muted">Page {page} of {totalPages}</p>
            </div>
          </div>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
            {superAdmin && (
              <label className="min-w-0">
                <span className="sr-only">Filter accounts by staff owner</span>
                <select
                  value={adminFilter}
                  onChange={(event) => { setAdminFilter(event.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:w-56 sm:text-sm"
                >
                  <option value="">All staff owners</option>
                  {admins.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
            <label className="min-w-0">
              <span className="sr-only">Filter accounts by status</span>
              <select
                value={statusFilter}
                onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
                aria-label="Filter accounts by status"
                className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:min-w-40 sm:text-sm"
              >
                <option value="">All statuses</option>
                {ACCOUNT_STATUSES.map((status) => <option key={status} value={status}>{ACCOUNT_STATUS_LABELS[status]}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filter accounts by verification</span>
              <select
                value={verifiedFilter}
                onChange={(event) => { setVerifiedFilter(event.target.value); setPage(1); }}
                aria-label="Filter accounts by verification"
                className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:min-w-40 sm:text-sm"
              >
                <option value="">All verification</option>
                <option value="true">Verified</option>
                <option value="false">Not verified</option>
              </select>
            </label>
            <label className="relative block min-w-0 sm:w-64">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-myinder-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search accounts"
                aria-label="Search accounts"
                className="w-full rounded-xl border border-blue-100 bg-white py-2.5 pl-9 pr-3 text-base text-myinder-navy outline-none focus:border-blue-300 sm:text-sm"
              />
            </label>
          </div>
        </div>

        {listError ? (
          <div className="p-8 text-center">
            <p role="alert" className="mx-auto max-w-2xl text-sm text-rose-700">
              Accounts could not be loaded: {listError}
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => void loadAccounts(true)}>Try again</Button>
          </div>
        ) : loading ? (
          <LoadingState label="Loading account records..." />
        ) : visibleItems.length === 0 ? (
          <div className="p-10 text-center">
            <UsersRound size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 font-semibold text-myinder-navy">
              {search || statusFilter || verifiedFilter
                ? "No accounts match these filters."
                : "No assigned accounts yet."}
            </p>
          </div>
        ) : (
          <>
              <div className="grid gap-3 p-3 xl:hidden">
                {visibleItems.map((account) => (
                  <article key={account.id} className="overflow-hidden rounded-xl border border-blue-100 bg-white p-4">
                    <p className="truncate font-semibold text-myinder-navy">{account.university}</p>
                    <p className="mt-1 truncate text-sm text-myinder-muted">@{account.handle}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <p className="text-sm text-myinder-navy">
                        <span className="block text-xs font-medium text-myinder-muted">Status</span>
                        {ACCOUNT_STATUS_LABELS[account.status]}
                      </p>
                      <p className="text-sm text-myinder-navy">
                        <span className="block text-xs font-medium text-myinder-muted">Verification</span>
                        <span className="mt-1 block"><VerificationBadge verified={account.verified} /></span>
                      </p>
                    </div>
                    <p className="mt-3 truncate text-xs text-myinder-muted">
                      Assigned to: {superAdmin
                        ? admins.find((item) => item.id === account.adminId)?.name ?? "Staff member"
                        : admin?.name ?? "You"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDetailsAccount(account)}
                      className="mt-4 flex min-h-10 w-full items-center justify-center rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-myinder-blue transition-colors hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    >
                      View
                    </button>
                  </article>
                ))}
              </div>
              <div className="hidden xl:block">
                <table className="w-full table-fixed text-left text-xs">
                  <colgroup>
                    <col className={superAdmin ? "w-[13%]" : "w-[17%]"} />
                    <col className={superAdmin ? "w-[7%]" : "w-[8%]"} />
                    <col className={superAdmin ? "w-[8%]" : "w-[9%]"} />
                    {superAdmin && <col className="w-[9%]" />}
                    <col className={superAdmin ? "w-[19%]" : "w-[22%]"} />
                    <col className={superAdmin ? "w-[11%]" : "w-[10%]"} />
                    <col className={superAdmin ? "w-[11%]" : "w-[10%]"} />
                    <col className={superAdmin ? "w-[8%]" : "w-[10%]"} />
                    <col className={superAdmin ? "w-[14%]" : "w-[13%]"} />
                  </colgroup>
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-3">Account</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Verified</th>
                      {superAdmin && (
                        <th className="px-2 py-3">Owner</th>
                      )}
                      <th className="px-2 py-3">Login details</th>
                      <th className="px-2 py-3">Email recovery</th>
                      <th className="px-2 py-3">Account recovery</th>
                      <th className="px-2 py-3">Followers</th>
                      <th className="px-2 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {visibleItems.map((account) => (
                      <tr key={account.id} className="align-top hover:bg-blue-50/40">
                        <td className="break-words px-2 py-3">
                          <p className="font-semibold text-myinder-navy">{account.university}</p>
                          <p className="mt-0.5 break-all text-[11px] text-myinder-muted">@{account.handle}</p>
                        </td>
                        <td className="break-words px-2 py-3 text-myinder-navy">{ACCOUNT_STATUS_LABELS[account.status]}</td>
                        <td className="px-2 py-3"><VerificationBadge verified={account.verified} /></td>
                        {superAdmin && (
                          <td className="break-words px-2 py-3 text-myinder-muted">
                            {admins.find((item) => item.id === account.adminId)?.name ?? "Staff member"}
                          </td>
                        )}
                        <td className="min-w-0 px-2 py-3">
                          <p className="truncate text-myinder-navy" title={account.email}>{account.email || "—"}</p>
                          <div className="mt-1"><SecretValue value={account.emailPassword} label="email password" compact /></div>
                          <div className="mt-1"><SecretValue value={account.accountPassword} label="account password" compact /></div>
                        </td>
                        <td className="break-all px-2 py-3 text-[11px] text-myinder-muted">{account.emailRecoveryNo || "—"}</td>
                        <td className="break-all px-2 py-3 text-[11px] text-myinder-muted">{account.accountRecoveryNo || "—"}</td>
                        <td className="break-words px-2 py-3 text-[11px] text-myinder-muted">{account.followers || "—"}</td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => void openEdit(account)} disabled={Boolean(loadingAccountId)} aria-label={`Edit ${account.handle}`} title="Edit account" className="rounded-lg p-2 text-myinder-blue hover:bg-blue-50 disabled:opacity-50"><Pencil size={16} /></button>
                            <button type="button" onClick={() => void removeAccount(account)} aria-label={`Delete ${account.handle}`} title="Delete account" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            {totalPages > 1 && (
              <div className="flex justify-center border-t border-blue-50 px-5 py-4">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </section>

      {detailsAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsAccount(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-details-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-blue-100 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="account-details-title" className="truncate text-xl font-bold text-myinder-navy">{detailsAccount.university}</h2>
                <p className="mt-1 truncate text-sm text-myinder-muted">@{detailsAccount.handle}</p>
              </div>
              <button
                type="button"
                aria-label="Close account details"
                onClick={() => setDetailsAccount(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Assigned staff</dt>
              <dd className="mt-1 break-words text-sm text-myinder-navy">
                {superAdmin
                  ? admins.find((item) => item.id === detailsAccount.adminId)?.name ?? "Staff member"
                  : admin?.name ?? "You"}
              </dd>
            </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Status</dt>
                <dd className="mt-1 break-words text-sm text-myinder-navy">{ACCOUNT_STATUS_LABELS[detailsAccount.status]}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Verification</dt>
                <dd className="mt-1"><VerificationBadge verified={detailsAccount.verified} /></dd>
              </div>
              <>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Email</dt>
                <dd className="mt-1 break-words text-sm text-myinder-navy">{detailsAccount.email || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Email password</dt>
                <dd className="mt-1"><SecretValue value={detailsAccount.emailPassword} label="email password" /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Account password</dt>
                <dd className="mt-1"><SecretValue value={detailsAccount.accountPassword} label="account password" /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Email recovery number</dt>
                <dd className="mt-1 break-words text-sm text-myinder-navy">{detailsAccount.emailRecoveryNo || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Account recovery number</dt>
                <dd className="mt-1 break-words text-sm text-myinder-navy">{detailsAccount.accountRecoveryNo || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-myinder-muted">Followers</dt>
                <dd className="mt-1 break-words text-sm text-myinder-navy">{detailsAccount.followers || "—"}</dd>
              </div>
              </>
            </dl>
            <div className="mt-6 flex justify-end gap-2 border-t border-blue-50 pt-4">
              <Button type="button" variant="secondary" onClick={() => setDetailsAccount(null)}>Close</Button>
              <Button
                type="button"
                variant="secondary"
                className="text-red-600"
                onClick={() => {
                  const account = detailsAccount;
                  setDetailsAccount(null);
                  void removeAccount(account);
                }}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const account = detailsAccount;
                  setDetailsAccount(null);
                  void openEdit(account);
                }}
              >
                <Pencil size={15} /> Edit
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
