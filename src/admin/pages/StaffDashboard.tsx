import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Frame,
  LogIn,
  LogOut,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import useToastFeedback from "../../hooks/useToastFeedback";
import Modal from "../../components/ui/Modal";
import LoadingState from "../../components/shared/LoadingState";
import { getSales, normalizePaymentMethod, PAYMENT_METHODS } from "../services/salesService";
import { getCommissions } from "../services/commissionsService";
import { getPreviousNairobiDate } from "../services/previousSalesReview";
import { getUniversities } from "../services/universitiesService";
import {
  getCurrentShift,
  updateShift,
  type ShiftAction,
  type TimeShift,
} from "../services/timeTrackingService";
import type { AdminAccount } from "../services/adminAuthService";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import PreviousSalesReview from "../components/PreviousSalesReview";
import { openStaffSaleForm } from "../components/StaffSaleLauncher";
import usePreviousSalesReviewStatus from "../hooks/usePreviousSalesReviewStatus";

const TIMEZONE = "Africa/Nairobi";
const SHIFT_KEY = ["admin-time-tracking"] as const;
const SALES_KEY = ["admin-sales"] as const;
const METHOD_STYLES: Record<string, { icon: string; color: string }> = {
  "Zelle": { icon: "Z", color: "bg-purple-700" },
  "Cash App": { icon: "$", color: "bg-green-600" },
  "Venmo": { icon: "V", color: "bg-sky-600" },
  "PayPal": { icon: "P", color: "bg-blue-600" },
  "Apple Pay": { icon: "▯", color: "bg-slate-100 text-slate-700" },
  "Stripe": { icon: "S", color: "bg-indigo-600" },
};

function getTodayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getCommissionWeek(date: string): { start: string; end: string } {
  const monday = new Date(`${date}T00:00:00Z`);
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const start = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 6);
  return { start, end: monday.toISOString().slice(0, 10) };
}

function getStaffUniversities(admin: AdminAccount) {
  if (admin.schools.length) return Promise.resolve(admin.schools);
  if (!admin.schoolIds.length) return Promise.resolve([]);
  return getUniversities().then((universities) =>
    universities
      .filter((university) => admin.schoolIds.includes(university.id))
      .map((university) => ({ id: university.id, name: university.name })),
  );
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: TIMEZONE,
      }).format(date)
    : "Time unavailable";
}

function getGreeting(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getCurrentWorkSeconds(shift: TimeShift, updatedAt: number, now: number): number {
  const resetAt = new Date(shift.reset_at).getTime();
  const end = Number.isFinite(resetAt) ? Math.min(now, resetAt) : now;
  const elapsed = Math.max(0, Math.floor((end - updatedAt) / 1000));
  return shift.active_seconds + (shift.status === "active" ? elapsed : 0);
}

function MethodIcon({ method }: { method: string }) {
  const style = METHOD_STYLES[method] ?? { icon: method.slice(0, 1).toUpperCase(), color: "bg-slate-700" };
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold text-white ${style.color}`}>
      {style.icon}
    </span>
  );
}

export default function StaffDashboard() {
  const admin = useAdminAuthStore((state) => state.admin);
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [commissionHistoryOpen, setCommissionHistoryOpen] = useState(false);
  const [action, setAction] = useState<ShiftAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const shiftQuery = useQuery({
    queryKey: [...SHIFT_KEY, adminId ?? "", "current"],
    queryFn: getCurrentShift,
    enabled: Boolean(adminId),
    staleTime: 0,
    refetchInterval: (query) => query.state.data ? 5_000 : 30_000,
    refetchOnWindowFocus: true,
  });
  const salesQuery = useQuery({
    queryKey: [...SALES_KEY, adminId ?? ""],
    queryFn: getSales,
    enabled: Boolean(adminId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const commissionsQuery = useQuery({
    queryKey: ["admin-commissions", adminId ?? ""],
    queryFn: getCommissions,
    enabled: Boolean(adminId),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const schoolsQuery = useQuery({
    queryKey: ["admin-sales", adminId ?? "", "assigned-schools", admin?.schoolIds.join(",") ?? ""],
    queryFn: () => {
      if (!admin) throw new Error("Your staff account is unavailable.");
      return getStaffUniversities(admin);
    },
    enabled: Boolean(adminId && admin),
    staleTime: 60_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const shift = shiftQuery.data?.status === "clocked_out" ? null : shiftQuery.data ?? null;
  const workSeconds = shift
    ? getCurrentWorkSeconds(shift, shiftQuery.dataUpdatedAt, now)
    : 0;
  const resetAt = shift ? new Date(shift.reset_at).getTime() : Number.NaN;
  const resetReached = Boolean(shift && Number.isFinite(resetAt) && now >= resetAt);
  const schools = schoolsQuery.data ?? [];
  const schoolNames = useMemo(
    () => new Map(schools.map((school) => [school.id, school.name])),
    [schools],
  );
  const today = getTodayInNairobi();
  const commissionWeek = getCommissionWeek(today);
  const weeklyCommissions = commissionsQuery.data ?? [];
  const currentWeekCommission = weeklyCommissions.find(
    (commission) =>
      commission.start_date === commissionWeek.start &&
      commission.end_date === commissionWeek.end,
  );
  const pendingWeekCommission = currentWeekCommission?.payment_status === "pending"
    ? currentWeekCommission
    : undefined;
  const previousDay = getPreviousNairobiDate();
  const previousDayReviewed = usePreviousSalesReviewStatus(adminId, previousDay);
  const previousDaySales = useMemo(
    () => (salesQuery.data ?? []).filter((sale) => sale.sale_date === previousDay),
    [previousDay, salesQuery.data],
  );
  const previousSalesReady =
    salesQuery.isSuccess && previousDaySales.length > 0 && previousDayReviewed;
  const todaySales = useMemo(
    () => (salesQuery.data ?? []).filter((sale) => sale.sale_date === today),
    [salesQuery.data, today],
  );
  const salesByMethod = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    for (const method of PAYMENT_METHODS) totals.set(method, { amount: 0, count: 0 });
    for (const sale of todaySales) {
      const method = normalizePaymentMethod(sale.payment_method);
      if (!method) continue;
      const current = totals.get(method) ?? { amount: 0, count: 0 };
      totals.set(method, {
        amount: current.amount + sale.amount,
        count: current.count + 1,
      });
    }
    return totals;
  }, [todaySales]);
  const paymentMethods = [...salesByMethod.keys()];

  useToastFeedback(
    actionError ||
      shiftQuery.error?.message ||
      salesQuery.error?.message ||
      schoolsQuery.error?.message,
    notice,
  );

  async function runShiftAction(nextAction: ShiftAction) {
    if (action || resetReached) return;
    if (nextAction === "clock-in" && !previousSalesReady) {
      setActionError(
        salesQuery.isError
          ? "Unable to verify previous-day sales. Refresh and try again."
          : previousDaySales.length === 0
            ? "Add at least one sale for the previous day before clocking in."
            : "Confirm the previous day's sales before clocking in.",
      );
      return;
    }
    setAction(nextAction);
    setActionError("");
    setNotice("");
    try {
      const updatedShift = await updateShift(nextAction);
      queryClient.setQueryData(
        [...SHIFT_KEY, adminId ?? "", "current"],
        nextAction === "clock-out" ? null : updatedShift,
      );
      setNotice(
        nextAction === "clock-in" ? "You’re clocked in."
          : nextAction === "pause" ? "Break started."
            : nextAction === "resume" ? "Work resumed."
              : "You’re clocked out.",
      );
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update your attendance.");
      void shiftQuery.refetch();
    } finally {
      setAction(null);
    }
  }

  if (!admin || !adminId) {
    return <p className="py-10 text-center text-slate-400">Your staff account is unavailable. Sign in again.</p>;
  }

  const actionButton = (nextAction: ShiftAction, label: string, Icon: typeof LogIn, className = "") => (
    <button
      type="button"
      onClick={() => void runShiftAction(nextAction)}
      disabled={
        Boolean(action) ||
        resetReached ||
        (nextAction === "clock-in" && !previousSalesReady)
      }
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {action === nextAction ? <RefreshCw size={15} className="animate-spin" /> : <Icon size={15} />}
      {action === nextAction ? "Updating..." : label}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-4 pb-28 sm:space-y-5 lg:space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 sm:p-5">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            {getGreeting(new Date(now))}, {admin.name.split(" ")[0]}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">Here’s what’s happening with your business today.</p>
        </div>
        <span className={`shrink-0 rounded-xl border px-3 py-2 text-center text-[10px] font-semibold leading-tight ${
          shift?.status === "active"
            ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
            : shift?.status === "paused"
              ? "border-amber-800 bg-amber-950/50 text-amber-200"
              : "border-slate-700 bg-slate-900 text-slate-300"
        }`}>
          {shift?.status === "active" ? <><Check size={14} className="mx-auto mb-0.5" />On shift</>
            : shift?.status === "paused" ? "On break"
              : previousSalesReady ? <>You can<br />clock in</> : <>Review sales<br />to clock in</>}
        </span>
        <Link
          to="/staff/frames"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 sm:ml-auto sm:w-auto"
        >
          <Frame size={17} /> Create a frame
        </Link>
      </header>

      <PreviousSalesReview
        adminId={adminId ?? ""}
        sales={salesQuery.data ?? []}
        loading={salesQuery.isPending}
        error={salesQuery.error?.message}
        onAddSale={openStaffSaleForm}
      />

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="min-w-0 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-3.5 sm:p-5 xl:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white xl:text-base">
            <Clock3 size={16} className="shrink-0 text-slate-300" /> Attendance
          </h2>
          <p className="mt-4 text-[11px] text-slate-400 xl:mt-6 xl:text-xs">Clocked in at</p>
          <p className="mt-1 text-sm font-extrabold text-emerald-400 xl:text-lg">
            {shift ? `${formatTime(shift.clocked_in_at)} EAT` : "Not clocked in"}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-300 xl:text-sm">
            {shift ? `Working time · ${formatDuration(workSeconds)}` : "Start your shift to track work time."}
          </p>
          {shift?.status === "active" ? (
            <div className="mt-3 flex flex-wrap gap-2 xl:mt-5">
              {actionButton("pause", "Start break", Coffee, "bg-slate-800 text-white")}
              {actionButton("clock-out", "Clock out", LogOut, "bg-rose-700 text-white")}
            </div>
          ) : shift?.status === "paused" ? (
            <div className="mt-3 flex flex-wrap gap-2 xl:mt-5">
              {actionButton("resume", "Resume", Activity, "bg-slate-800 text-white")}
              {actionButton("clock-out", "Clock out", LogOut, "bg-rose-700 text-white")}
            </div>
          ) : (
            <div className="mt-3 xl:mt-5">
              {actionButton("clock-in", "Clock in", LogIn, "bg-emerald-600 text-white")}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-3.5 sm:p-5 xl:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white xl:text-base">
            <Wallet size={16} className="shrink-0 text-slate-300" /> Pending Week Commission
          </h2>
          <p className="mt-5 text-2xl font-extrabold tabular-nums text-emerald-400 xl:mt-7 xl:text-3xl">
            {commissionsQuery.isPending
              ? "…"
              : commissionsQuery.isError
                ? "Unavailable"
                : pendingWeekCommission
                  ? formatCurrency(Number(pendingWeekCommission.commission_total))
                  : currentWeekCommission?.payment_status === "paid"
                    ? "Paid"
                  : "Not generated"}
          </p>
          <p className="mt-3 text-xs text-slate-400">Week sales</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-white">
            {commissionsQuery.isError
              ? "Unable to load commission"
              : pendingWeekCommission
                ? formatCurrency(Number(pendingWeekCommission.week_sales))
                : currentWeekCommission?.payment_status === "paid"
                  ? `Commission paid: ${formatCurrency(Number(currentWeekCommission.commission_total))}`
                  : "No pending commission recorded"}
          </p>
          <button
            type="button"
            onClick={() => setCommissionHistoryOpen(true)}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-emerald-900 bg-slate-800 px-2 py-2 text-center text-[11px] font-bold leading-tight text-slate-100 transition hover:bg-slate-700"
          >
            View Commission History <ChevronRight size={14} className="shrink-0" />
          </button>
        </article>
      </section>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:gap-6">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-bold text-white">Today’s Transactions</h2>
          <span className="rounded-xl border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-sm font-extrabold tabular-nums text-sky-400">
            {salesQuery.isPending ? "…" : todaySales.length}
          </span>
        </header>
        {salesQuery.isPending ? (
          <LoadingState label="Loading today’s transactions..." />
        ) : salesQuery.isError ? (
          <p className="px-4 py-5 text-sm text-rose-300">Today’s sales could not be loaded.</p>
        ) : todaySales.length ? (
          <div className="divide-y divide-slate-800">
            {[...todaySales].sort((a, b) => `${b.time}`.localeCompare(a.time)).map((sale, index) => (
              <article key={sale.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3">
                <span className="text-[10px] text-slate-500">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-200">{schoolNames.get(sale.university_id) ?? "Assigned university"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{sale.payment_method} · {sale.time.slice(0, 5)}</p>
                </div>
                <p className="text-xs font-bold tabular-nums text-emerald-400">{formatCurrency(sale.amount)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="px-4 py-5 text-sm text-slate-400">No sales yet today.</p>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 sm:p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-sm font-bold leading-5 text-white">
            Today’s Money <span className="font-normal text-slate-400">(by payment method)</span>
          </h2>
          <button
            type="button"
            onClick={() => setPaymentDetailsOpen(true)}
            className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-sky-400 hover:text-sky-300"
          >
            View Details <ChevronRight size={14} />
          </button>
        </header>
        {salesQuery.isError ? (
          <p className="text-sm text-rose-300">Payment method totals are unavailable.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
            {paymentMethods.map((method) => {
              const totals = salesByMethod.get(method) ?? { amount: 0, count: 0 };
              return (
                <article key={method} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
                  <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-100">
                    <MethodIcon method={method} />
                    <span className="truncate">{method}</span>
                  </h3>
                  <p className="mt-2 text-lg font-extrabold tabular-nums text-emerald-400">{formatCurrency(totals.amount)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{totals.count} {totals.count === 1 ? "sale" : "sales"}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
      </div>

      {paymentDetailsOpen && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-details-title"
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-[#0d1729] p-5 shadow-2xl"
          >
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="payment-details-title" className="text-lg font-bold text-white">Today’s Sales</h2>
                <p className="mt-1 text-xs text-slate-400">Sales by payment method</p>
              </div>
              <button type="button" aria-label="Close payment details" onClick={() => setPaymentDetailsOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">
                <X size={20} />
              </button>
            </header>
            <ul className="divide-y divide-slate-800">
              {[...salesByMethod].map(([method, totals]) => (
                <li key={method} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-white"><MethodIcon method={method} />{method}</span>
                  <span className="shrink-0 text-right">
                    <strong className="block text-sm tabular-nums text-emerald-400">{formatCurrency(totals.amount)}</strong>
                    <small className="text-xs text-slate-400">{totals.count} {totals.count === 1 ? "sale" : "sales"}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </Modal>
      )}

      {commissionHistoryOpen && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="commission-history-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#0d1729] p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 id="commission-history-title" className="text-lg font-bold text-white">Commission history</h2>
                <p className="mt-1 text-xs text-slate-400">Your weekly records and payment status.</p>
              </div>
              <button type="button" aria-label="Close commission history" onClick={() => setCommissionHistoryOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">
                <X size={20} />
              </button>
            </header>
            {commissionsQuery.isPending ? (
              <p className="mt-5 py-5 text-center text-sm text-slate-300">Loading commission history…</p>
            ) : commissionsQuery.isError ? (
              <p role="alert" className="mt-5 rounded-xl border border-rose-900 bg-rose-950/30 px-4 py-4 text-sm text-rose-200">
                Unable to load commission history: {commissionsQuery.error.message}
              </p>
            ) : weeklyCommissions.length ? (
              <div className="mt-5 max-h-[60dvh] space-y-2 overflow-y-auto">
                {weeklyCommissions.map((commission) => (
                  <article key={commission.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">
                        {commission.start_date} – {commission.end_date}
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        commission.payment_status === "paid"
                          ? "bg-emerald-950 text-emerald-200"
                          : "bg-amber-950 text-amber-200"
                      }`}>
                        {commission.payment_status === "paid" ? "Paid" : "Pending"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>Week sales: {formatCurrency(Number(commission.week_sales))}</span>
                      <strong className="text-sm text-emerald-300">{formatCurrency(Number(commission.commission_total))}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-5 text-center text-sm text-slate-300">
                No commission history is available yet.
              </p>
            )}
          </section>
        </Modal>
      )}
    </main>
  );
}
