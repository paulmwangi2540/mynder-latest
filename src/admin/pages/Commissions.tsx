import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, CalendarDays, CheckCircle2, Eye, RefreshCw, Trash2, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import Modal from "../../components/ui/Modal";
import useToastFeedback from "../../hooks/useToastFeedback";
import { getAdmins, type AdminAccount } from "../services/adminAuthService";
import {
  deleteCommission,
  generateBulkCommissions,
  getCommissions,
  updateCommissionPaymentStatus,
  type Commission,
} from "../services/commissionsService";
import { isStaffAdmin, isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

const COMMISSIONS_KEY = ["admin-commissions"] as const;
const ADMINS_KEY = ["commission-admins"] as const;

function getMondayDate(date = new Date()): string {
  const monday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return monday.toISOString().slice(0, 10);
}

function getWeekPeriod(date: string): { start: string; end: string } {
  const selected = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(selected.getTime())) throw new Error("Select a valid date for the commission week.");
  const day = selected.getUTCDay();
  selected.setUTCDate(selected.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const start = selected.toISOString().slice(0, 10);
  selected.setUTCDate(selected.getUTCDate() + 6);
  return { start, end: selected.toISOString().slice(0, 10) };
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : value;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

async function getAllStaff(accessToken: string): Promise<AdminAccount[]> {
  const firstPage = await getAdmins(accessToken, 1, "");
  const admins = [...firstPage.admins];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const result = await getAdmins(accessToken, page, "");
    admins.push(...result.admins);
  }
  return admins.filter(isStaffAdmin);
}

export default function Commissions() {
  const admin = useAdminAuthStore((state) => state.admin);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const superAdmin = isSuperAdmin(admin);
  const queryClient = useQueryClient();
  const [weekDate, setWeekDate] = useState(getMondayDate);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyCommissionId, setBusyCommissionId] = useState("");
  const [generatingAll, setGeneratingAll] = useState(false);
  const [commissionAdminFilter, setCommissionAdminFilter] = useState("");
  const [selectedCommissionId, setSelectedCommissionId] = useState<string | null>(null);
  useToastFeedback(actionError, success);

  const commissionsQuery = useQuery({
    queryKey: [...COMMISSIONS_KEY, admin?.id ?? ""],
    queryFn: getCommissions,
    enabled: Boolean(accessToken && admin?.id),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const adminsQuery = useQuery({
    queryKey: ADMINS_KEY,
    queryFn: () => {
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      return getAllStaff(accessToken);
    },
    enabled: Boolean(superAdmin && accessToken),
    staleTime: 60_000,
  });

  const adminsById = useMemo(
    () => new Map((adminsQuery.data ?? []).map((item) => [item.id, item])),
    [adminsQuery.data],
  );
  const commissions = (commissionsQuery.data ?? []).filter(
    (commission) => !superAdmin || adminsById.has(commission.admin_id),
  );
  const visibleCommissions = commissions.filter((commission) =>
    !commissionAdminFilter || commission.admin_id === commissionAdminFilter,
  );
  const selectedCommission = visibleCommissions.find(
    (commission) => commission.id === selectedCommissionId,
  );
  const pendingCount = visibleCommissions.filter((commission) => commission.payment_status === "pending").length;
  const paidCount = visibleCommissions.filter((commission) => commission.payment_status === "paid").length;
  const pendingTotal = visibleCommissions
    .filter((commission) => commission.payment_status === "pending")
    .reduce((sum, commission) => sum + Number(commission.commission_total), 0);
  const period = useMemo(
    () => weekDate ? getWeekPeriod(weekDate) : null,
    [weekDate],
  );

  async function refreshCommissions() {
    await queryClient.invalidateQueries({ queryKey: COMMISSIONS_KEY });
  }

  async function createWeeklyCommissionsForAll() {
    setActionError("");
    setSuccess("");
    if (!period) {
      setActionError("Select a valid date for the commission week.");
      return;
    }
    const staffCount = adminsQuery.data?.length ?? 0;
    if (!staffCount) {
      setActionError("No regular staff accounts are available to generate commissions for.");
      return;
    }
    if (!window.confirm(`Generate or recalculate regular staff commissions for ${formatDate(period.start)} – ${formatDate(period.end)}? Paid records will be skipped.`)) return;
    setGeneratingAll(true);
    try {
      const result = await generateBulkCommissions({
        start_date: period.start,
        end_date: period.end,
      });
      queryClient.setQueryData<Commission[]>(
        [...COMMISSIONS_KEY, admin?.id ?? ""],
        (current) => {
          const records = new Map(
            (current ?? []).map((commission) => [
              `${commission.admin_id}:${commission.start_date}:${commission.end_date}`,
              commission,
            ]),
          );
          for (const commission of result.commissions) {
            records.set(
              `${commission.admin_id}:${commission.start_date}:${commission.end_date}`,
              commission,
            );
          }
          return [...records.values()];
        },
      );
      await refreshCommissions();
      setSuccess(
        `${result.created} staff commission(s) created, ${result.updated} updated, and ${result.skipped_paid} paid record(s) skipped.`,
      );
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to generate staff commissions.");
    } finally {
      setGeneratingAll(false);
    }
  }

  async function markCommissionPaid(commission: Commission) {
    setActionError("");
    setSuccess("");
    setBusyCommissionId(commission.id);
    try {
      const updatedCommission = await updateCommissionPaymentStatus(commission.id, "paid");
      queryClient.setQueriesData<Commission[]>(
        { queryKey: COMMISSIONS_KEY },
        (current) => current?.map((item) =>
          item.id === updatedCommission.id ? updatedCommission : item,
        ),
      );
      setSuccess("Commission marked as paid.");
      await refreshCommissions();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update commission payment status.");
    } finally {
      setBusyCommissionId("");
    }
  }

  async function removeCommission(commission: Commission) {
    if (commission.payment_status !== "pending") return;
    if (!window.confirm("Delete this pending commission? This cannot be undone.")) return;
    setActionError("");
    setSuccess("");
    setBusyCommissionId(commission.id);
    try {
      await deleteCommission(commission.id);
      setSuccess("Pending commission deleted.");
      await refreshCommissions();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete the commission.");
    } finally {
      setBusyCommissionId("");
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            {superAdmin ? "Administration" : "Staff workspace"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Commissions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            {superAdmin
              ? "Generate weekly commissions for regular staff and manage pending payments."
              : "Review your weekly sales and commission records."}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={commissionsQuery.isFetching}
          onClick={() => void refreshCommissions()}
        >
          <RefreshCw size={16} className={commissionsQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>

      {superAdmin && (
        <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-myinder-blue">
              <CalendarDays size={20} />
            </span>
            <div>
              <h2 className="font-bold text-myinder-navy">Generate weekly staff commissions</h2>
              <p className="text-sm text-myinder-muted">Sends the selected week only. The server generates records for regular staff; super admins and mini admins are excluded.</p>
            </div>
          </div>
          {adminsQuery.isError && (
            <p role="status" className="mb-3 text-sm text-amber-800">
              Commission generation is available, but admin names could not be loaded:{" "}
              {adminsQuery.error instanceof Error ? adminsQuery.error.message : "Unknown admin list error."}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Date in commission week</span>
                <input
                  type="date"
                  value={weekDate}
                  onChange={(event) => setWeekDate(event.target.value)}
                  className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm text-myinder-navy outline-none focus:border-blue-300"
                />
                {period && (
                  <span className="mt-1 block text-xs text-myinder-muted">
                    Period: {formatDate(period.start)} – {formatDate(period.end)}
                  </span>
                )}
              </label>
              <Button
                onClick={() => void createWeeklyCommissionsForAll()}
                disabled={generatingAll || !weekDate}
                className="w-full justify-center sm:col-span-2"
              >
                <BadgeDollarSign size={17} />
                {generatingAll ? "Generating staff commissions…" : `Generate for all staff${adminsQuery.data?.length ? ` (${adminsQuery.data.length})` : ""}`}
              </Button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Weekly records</h2>
            <p className="text-sm text-slate-300">
              {visibleCommissions.length} shown · {commissions.length} total
            </p>
          </div>
          {superAdmin && (
            <label className="block w-full sm:max-w-xs">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Filter by admin</span>
              <select
                value={commissionAdminFilter}
                onChange={(event) => setCommissionAdminFilter(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
              >
                <option value="">All admins</option>
                {(adminsQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.email}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {superAdmin && !commissionsQuery.isPending && !commissionsQuery.isError && commissions.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-slate-700 bg-[#102237] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-300">{pendingCount}</p>
            </article>
            <article className="rounded-xl border border-slate-700 bg-[#102237] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Paid</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-300">{paidCount}</p>
            </article>
            <article className="col-span-2 rounded-xl border border-blue-900 bg-blue-950/40 p-4 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Pending payout total</p>
              <p className="mt-1 break-words text-2xl font-extrabold text-white">${pendingTotal.toFixed(2)}</p>
            </article>
          </div>
        )}

        {superAdmin && adminsQuery.isPending ? (
          <LoadingState label="Loading regular staff..." />
        ) : superAdmin && adminsQuery.isError ? (
          <div className="rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">
            <p>{adminsQuery.error instanceof Error ? adminsQuery.error.message : "Unable to load regular staff."}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void adminsQuery.refetch()}>Try again</Button>
          </div>
        ) : commissionsQuery.isPending ? (
          <LoadingState label="Loading commissions..." />
        ) : commissionsQuery.isError ? (
          <div className="rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">
            <p>{commissionsQuery.error instanceof Error ? commissionsQuery.error.message : "Unable to load commissions."}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void commissionsQuery.refetch()}>Try again</Button>
          </div>
        ) : commissions.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-[#0b1828] p-8 text-center text-sm text-slate-300">
            No commission records yet.
          </div>
        ) : visibleCommissions.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-[#0b1828] p-8 text-center text-sm text-slate-300">
            No commission records for this admin.
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {visibleCommissions.map((commission) => {
              const owner = adminsById.get(commission.admin_id);
              return (
                <article key={commission.id} className="rounded-2xl border border-slate-700 bg-[#102237] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {superAdmin && <p className="truncate text-sm font-bold text-white">{owner?.name ?? "Staff admin"}</p>}
                      <p className={`${superAdmin ? "mt-1" : ""} text-sm font-semibold text-slate-200`}>
                        {formatDate(commission.start_date)} – {formatDate(commission.end_date)}
                      </p>
                      {superAdmin && <p className="mt-1 break-all text-xs text-slate-400">{owner?.email ?? commission.admin_id}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      commission.payment_status === "paid"
                        ? "bg-emerald-950 text-emerald-200"
                        : "bg-amber-950 text-amber-200"
                    }`}>
                      {commission.payment_status === "paid" ? "Paid" : "Pending"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-700 pt-3">
                    <div>
                      <p className="text-xs text-slate-400">Week sales</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">${commission.week_sales}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Commission</p>
                      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-white">${commission.commission_total}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSelectedCommissionId(commission.id)}
                    aria-label={`View commission for ${owner?.name ?? formatDate(commission.start_date)}`}
                    className="mt-3 min-h-11 w-full justify-center"
                  >
                    <Eye size={16} /> View
                  </Button>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-700 bg-[#102237] md:block">
            <table className="w-full min-w-[680px] text-left text-sm xl:min-w-[1080px]">
              <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  {superAdmin && <th scope="col" className="w-[17%] px-3 py-3 sm:px-4">Admin</th>}
                  <th scope="col" className={`${superAdmin ? "w-[15%]" : "w-[20%]"} px-3 py-3 sm:px-4`}>Week</th>
                  <th scope="col" className={`${superAdmin ? "w-[10%]" : "w-[14%]"} px-3 py-3 text-right sm:px-4`}>Net amount</th>
                  <th scope="col" className="hidden w-[9%] px-3 py-3 text-right lg:table-cell">Weekday</th>
                  <th scope="col" className="hidden w-[9%] px-3 py-3 text-right lg:table-cell">Holiday</th>
                  <th scope="col" className="hidden w-[9%] px-3 py-3 text-right lg:table-cell">Sunday</th>
                  <th scope="col" className={`${superAdmin ? "w-[11%]" : "w-[15%]"} px-3 py-3 text-right sm:px-4`}>Commission</th>
                  <th scope="col" className={`${superAdmin ? "w-[10%]" : "w-[13%]"} px-3 py-3 text-center sm:px-4`}>Status</th>
                  {superAdmin && <th scope="col" className="w-[10%] px-3 py-3 text-right sm:px-4">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 text-slate-200">
                {visibleCommissions.map((commission) => {
                  const owner = adminsById.get(commission.admin_id);
                  const busy = busyCommissionId === commission.id;
                  return (
                    <tr key={commission.id} className="hover:bg-slate-800/40">
                      {superAdmin && (
                        <td className="break-words px-3 py-3 sm:px-4">
                          <span className="block font-semibold text-white">{owner?.name ?? "Admin"}</span>
                          <span className="mt-0.5 block break-all text-xs text-slate-400">
                            {owner ? `${owner.email} · ${owner.role.replace(/[_-]+/g, " ")}` : commission.admin_id}
                          </span>
                        </td>
                      )}
                      <td className="break-words px-3 py-3 sm:px-4">
                        <span className="block font-semibold text-white">{formatDate(commission.start_date)}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">to {formatDate(commission.end_date)}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-4">${commission.week_sales}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums lg:table-cell">${commission.weekday_commission}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums lg:table-cell">${commission.holiday_commission}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums lg:table-cell">${commission.sunday_commission}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-white sm:px-4">${commission.commission_total}</td>
                      <td className="px-3 py-3 text-center sm:px-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                          commission.payment_status === "paid"
                            ? "bg-emerald-950 text-emerald-200"
                            : "bg-amber-950 text-amber-200"
                        }`}>
                          {commission.payment_status === "paid" && <CheckCircle2 size={13} />}
                          {commission.payment_status === "paid" ? "Paid" : "Pending"}
                        </span>
                        <span className="mt-1 hidden text-[10px] text-slate-500 xl:block">{formatTimestamp(commission.paid_at)}</span>
                      </td>
                      {superAdmin && (
                        <td className="px-3 py-3 sm:px-4">
                          {commission.payment_status === "pending" ? (
                            <div className="flex flex-col justify-end gap-1.5 sm:flex-row">
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void removeCommission(commission)}
                                aria-label={`Delete ${owner?.name ?? "admin"} commission`}
                                className="min-h-9 justify-center px-2 py-1.5 text-xs"
                              >
                                <Trash2 size={14} /> <span className="hidden xl:inline">Delete</span>
                              </Button>
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => void markCommissionPaid(commission)}
                                aria-label={`Mark ${owner?.name ?? "admin"} commission paid`}
                                className="min-h-9 justify-center px-2 py-1.5 text-xs"
                              >
                                <CheckCircle2 size={14} /> <span className="hidden xl:inline">Mark paid</span>
                              </Button>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-slate-500">{formatTimestamp(commission.paid_at)}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {selectedCommission && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="commission-detail-title"
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#102237] p-5 shadow-2xl sm:p-6"
          >
            <header className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Weekly commission</p>
                <h2 id="commission-detail-title" className="mt-1 text-xl font-bold text-white">Commission details</h2>
              </div>
              <button
                type="button"
                aria-label="Close commission details"
                onClick={() => setSelectedCommissionId(null)}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </header>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {superAdmin && (
                <>
                  <dt className="text-slate-400">Staff</dt>
                  <dd className="break-words text-right font-semibold text-white">
                    {adminsById.get(selectedCommission.admin_id)?.name ?? "Staff admin"}
                  </dd>
                  <dt className="text-slate-400">Email</dt>
                  <dd className="break-all text-right text-slate-200">
                    {adminsById.get(selectedCommission.admin_id)?.email ?? selectedCommission.admin_id}
                  </dd>
                </>
              )}
              <dt className="text-slate-400">Week</dt>
              <dd className="text-right font-semibold text-white">
                {formatDate(selectedCommission.start_date)} – {formatDate(selectedCommission.end_date)}
              </dd>
              <dt className="text-slate-400">Week sales</dt>
              <dd className="text-right tabular-nums text-white">${selectedCommission.week_sales}</dd>
              <dt className="text-slate-400">Weekday commission</dt>
              <dd className="text-right tabular-nums text-white">${selectedCommission.weekday_commission}</dd>
              <dt className="text-slate-400">Holiday commission</dt>
              <dd className="text-right tabular-nums text-white">${selectedCommission.holiday_commission}</dd>
              <dt className="text-slate-400">Sunday commission</dt>
              <dd className="text-right tabular-nums text-white">${selectedCommission.sunday_commission}</dd>
              <dt className="text-slate-400">Total commission</dt>
              <dd className="text-right font-bold tabular-nums text-emerald-300">${selectedCommission.commission_total}</dd>
              <dt className="text-slate-400">Payment status</dt>
              <dd className="text-right font-semibold text-white">
                {selectedCommission.payment_status === "paid" ? "Paid" : "Pending"}
              </dd>
              <dt className="text-slate-400">Paid at</dt>
              <dd className="text-right text-slate-200">{formatTimestamp(selectedCommission.paid_at)}</dd>
            </dl>
            {superAdmin && selectedCommission.payment_status === "pending" && (
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-700 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyCommissionId === selectedCommission.id}
                  onClick={() => void removeCommission(selectedCommission)}
                  className="justify-center"
                >
                  <Trash2 size={16} /> Delete
                </Button>
                <Button
                  type="button"
                  disabled={busyCommissionId === selectedCommission.id}
                  onClick={() => void markCommissionPaid(selectedCommission)}
                  className="justify-center"
                >
                  <CheckCircle2 size={16} /> Mark paid
                </Button>
              </div>
            )}
          </section>
        </Modal>
      )}
    </main>
  );
}
