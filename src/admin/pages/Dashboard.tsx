import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileText,
} from "lucide-react";
import DashboardCommunitySection, { type UniversityCount } from "../components/dashboard/DashboardCommunitySection";
import DashboardRecentUsers from "../components/dashboard/DashboardRecentUsers";
import DashboardRegistrationSection, {
  type RegistrationBucket,
  type RegistrationPeriod,
} from "../components/dashboard/DashboardRegistrationSection";
import DashboardRevenueChart, {
  type RevenuePeriod,
  type RevenuePoint,
} from "../components/dashboard/DashboardRevenueChart";
import DashboardSummaryCards from "../components/dashboard/DashboardSummaryCards";
import { useUsers } from "../hooks/useUsers";
import { getAdminPaymentStatuses, getInvoices, type UserInvoice } from "../services/invoicesService";
import { getUniversities } from "../services/universitiesService";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import LoadingState from "../../components/shared/LoadingState";
import type { SavedUser } from "../types/admin.types";

type Status = UserInvoice["status"];

interface Metric {
  label: string;
  amount: number;
  previousAmount: number;
  value: string;
  previousValue: string;
}

const statusColors: Record<Status, string> = {
  successful: "#2a9d8f",
  pending: "#e3a43b",
  failed: "#d95d5d",
  canceled: "#94a3b8",
  refunded: "#8b6bd6",
  unknown: "#4e7fbd",
};

const visibleStatuses: Status[] = [
  "successful",
  "pending",
  "failed",
  "refunded",
  "canceled",
  "unknown",
];

function getInvoiceStatus(invoice: UserInvoice, paymentStatuses: Map<string, Status>): Status {
  return (invoice.paymentId && paymentStatuses.get(invoice.paymentId)) || invoice.status;
}

function getUniversityCounts(users: SavedUser[]): UniversityCount[] {
  const counts = new Map<string, number>();
  for (const user of users) {
    const name = user.university.trim() || "University not provided";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8);
}

function getRegistrationBuckets(
  users: SavedUser[],
  periodDays: RegistrationPeriod,
): RegistrationBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - periodDays + 1);
  const bucketDays = periodDays === 7 ? 1 : periodDays === 30 ? 5 : 15;
  const registrations = users
    .map((user) => user.createdAt ? new Date(user.createdAt) : null)
    .filter((date): date is Date => date !== null && Number.isFinite(date.getTime()))
    .map((date) => {
      date.setHours(0, 0, 0, 0);
      return date;
    });
  const buckets: RegistrationBucket[] = [];
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

  for (let offset = 0; offset < periodDays; offset += bucketDays) {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + offset);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + Math.min(bucketDays, periodDays - offset));
    buckets.push({
      label: formatter.format(bucketStart),
      count: registrations.filter((date) => date >= bucketStart && date < bucketEnd).length,
    });
  }
  return buckets;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getPeriodRange(period: RevenuePeriod, now: Date): { start: Date; end: Date } {
  const end = startOfDay(now);
  if (period === "year") return { start: new Date(now.getFullYear(), 0, 1), end };
  if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start, end };
}

function getRevenuePoints(
  invoices: UserInvoice[],
  paymentStatuses: Map<string, Status>,
  period: RevenuePeriod,
  currency: string,
  now: Date,
): RevenuePoint[] {
  const { start, end } = getPeriodRange(period, now);
  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const bucketCount = period === "week" ? 7 : period === "month" ? 6 : 12;
  const points: RevenuePoint[] = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start);
    const bucketEnd = new Date(start);
    if (period === "year") {
      bucketStart.setMonth(start.getMonth() + index);
      bucketEnd.setMonth(start.getMonth() + index + 1);
    } else {
      const firstDay = Math.floor((index * days) / bucketCount);
      const afterLastDay = Math.floor(((index + 1) * days) / bucketCount);
      bucketStart.setDate(start.getDate() + firstDay);
      bucketEnd.setDate(start.getDate() + Math.max(firstDay + 1, afterLastDay));
    }

    const label = period === "year"
      ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(bucketStart)
      : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(bucketStart);
    return {
      label,
      timestamp: bucketStart.getTime(),
      amount: invoices.reduce((total, invoice) => {
        if (
          getInvoiceStatus(invoice, paymentStatuses) !== "successful" ||
          invoice.currency !== currency ||
          invoice.amountMinor === undefined ||
          !invoice.paidAt
        ) return total;
        const paidAt = new Date(invoice.paidAt);
        return Number.isFinite(paidAt.getTime()) &&
          paidAt >= bucketStart &&
          paidAt < bucketEnd
          ? total + invoice.amountMinor
          : total;
      }, 0),
    };
  });

  return points;
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatRevenue(
  invoices: UserInvoice[],
  paymentStatuses: Map<string, Status>,
): string {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    if (
      getInvoiceStatus(invoice, paymentStatuses) !== "successful" ||
      invoice.amountMinor === undefined ||
      !invoice.currency
    ) continue;
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.amountMinor);
  }

  if (!totals.size) return "—";
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) =>
      new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100),
    )
    .join(" · ");
}

function getMonthMetrics(
  invoices: UserInvoice[],
  paymentStatuses: Map<string, Status>,
  users: SavedUser[],
  currency: string,
  now: Date,
): Metric[] {
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const elapsedDays = now.getDate();
  const previousEnd = new Date(
    previousStart.getFullYear(),
    previousStart.getMonth(),
    Math.min(elapsedDays + 1, new Date(now.getFullYear(), now.getMonth(), 0).getDate() + 1),
  );
  const currentPaid = invoices.filter((invoice) => {
    if (
      getInvoiceStatus(invoice, paymentStatuses) !== "successful" ||
      invoice.currency !== currency ||
      invoice.amountMinor === undefined ||
      !invoice.paidAt
    ) return false;
    const paidAt = new Date(invoice.paidAt);
    return Number.isFinite(paidAt.getTime()) && paidAt >= currentStart && paidAt < nextStart;
  });
  const previousPaid = invoices.filter((invoice) => {
    if (
      getInvoiceStatus(invoice, paymentStatuses) !== "successful" ||
      invoice.currency !== currency ||
      invoice.amountMinor === undefined ||
      !invoice.paidAt
    ) return false;
    const paidAt = new Date(invoice.paidAt);
    return Number.isFinite(paidAt.getTime()) && paidAt >= previousStart && paidAt < previousEnd;
  });
  const currentUsers = users.filter((user) => {
    if (!user.createdAt) return false;
    const createdAt = new Date(user.createdAt);
    return Number.isFinite(createdAt.getTime()) && createdAt >= currentStart && createdAt < nextStart;
  }).length;
  const previousUsers = users.filter((user) => {
    if (!user.createdAt) return false;
    const createdAt = new Date(user.createdAt);
    return Number.isFinite(createdAt.getTime()) && createdAt >= previousStart && createdAt < previousEnd;
  }).length;
  const currentRevenue = currentPaid.reduce((total, invoice) => total + (invoice.amountMinor ?? 0), 0);
  const previousRevenue = previousPaid.reduce((total, invoice) => total + (invoice.amountMinor ?? 0), 0);

  return [
    {
      label: "Successful revenue",
      amount: currentRevenue,
      previousAmount: previousRevenue,
      value: currency ? formatMoney(currentRevenue, currency) : "—",
      previousValue: currency ? formatMoney(previousRevenue, currency) : "—",
    },
    {
      label: "New users",
      amount: currentUsers,
      previousAmount: previousUsers,
      value: currentUsers.toLocaleString(),
      previousValue: previousUsers.toLocaleString(),
    },
    {
      label: "Successful payments",
      amount: currentPaid.length,
      previousAmount: previousPaid.length,
      value: currentPaid.length.toLocaleString(),
      previousValue: previousPaid.length.toLocaleString(),
    },
  ];
}

function getChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "Up from 0";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? "+" : ""}${change}% vs previous month`;
}

function formatDate(value?: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function Dashboard() {
  const { users, hasData, loading, error } = useUsers();
  const admin = useAdminAuthStore((state) => state.admin);
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [period, setPeriod] = useState<RevenuePeriod>("week");
  const [registrationPeriod, setRegistrationPeriod] = useState<RegistrationPeriod>(30);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const dashboardRef = useRef<HTMLElement>(null);
  const invoicesQuery = useQuery({
    queryKey: ["admin-dashboard", adminId ?? "", "invoices"],
    queryFn: getInvoices,
    enabled: Boolean(adminId && accessToken),
    staleTime: 60_000,
  });
  const paymentStatusesQuery = useQuery({
    queryKey: ["admin-dashboard", adminId ?? "", "payment-statuses"],
    queryFn: getAdminPaymentStatuses,
    enabled: Boolean(adminId && accessToken),
    staleTime: 60_000,
  });
  const universitiesQuery = useQuery({
    queryKey: ["admin-dashboard", adminId ?? "", "universities"],
    queryFn: getUniversities,
    enabled: Boolean(adminId && accessToken),
    staleTime: 60_000,
  });

  const invoices = invoicesQuery.data ?? [];
  const paymentStatuses = paymentStatusesQuery.data ?? new Map<string, Status>();
  const universityCounts = useMemo(() => getUniversityCounts(users), [users]);
  const registrationBuckets = useMemo(
    () => getRegistrationBuckets(users, registrationPeriod),
    [users, registrationPeriod],
  );
  const maxRegistrationCount = Math.max(1, ...registrationBuckets.map((bucket) => bucket.count));
  const registeredInPeriod = registrationBuckets.reduce((total, bucket) => total + bucket.count, 0);
  const hasRegistrationDates = users.some((user) =>
    user.createdAt && Number.isFinite(new Date(user.createdAt).getTime()),
  );
  const currencies = useMemo(
    () => [...new Set(invoices.flatMap((invoice) => invoice.currency ? [invoice.currency] : []))].sort(),
    [invoices],
  );
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? "";
  const now = new Date();
  const revenuePoints = useMemo(
    () => getRevenuePoints(invoices, paymentStatuses, period, currency, now),
    [invoices, paymentStatuses, period, currency],
  );
  const paymentCounts = useMemo(() => {
    const counts = new Map<Status, number>();
    for (const invoice of invoices) {
      const status = getInvoiceStatus(invoice, paymentStatuses);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [invoices, paymentStatuses]);
  const paymentTotal = invoices.length;
  const successfulPayments = paymentCounts.get("successful") ?? 0;
  const pendingPayments = paymentCounts.get("pending") ?? 0;
  const paymentSegments = useMemo(() => {
    let offset = 0;
    return visibleStatuses.flatMap((status) => {
      const count = paymentCounts.get(status) ?? 0;
      if (count === 0 || paymentTotal === 0) return [];
      const start = offset;
      offset += (count / paymentTotal) * 100;
      return [`${statusColors[status]} ${start}% ${offset}%`];
    });
  }, [paymentCounts, paymentTotal]);
  const recentInvoices = useMemo(
    () => [...invoices]
      .sort((left, right) => {
        const leftDate = left.paidAt ? new Date(left.paidAt).getTime() : 0;
        const rightDate = right.paidAt ? new Date(right.paidAt).getTime() : 0;
        return rightDate - leftDate;
      })
      .slice(0, 5),
    [invoices],
  );
  const monthMetrics = useMemo(
    () => getMonthMetrics(invoices, paymentStatuses, users, currency, now),
    [invoices, paymentStatuses, users, currency],
  );

  useEffect(() => {
    const root = dashboardRef.current;
    if (!root) return;
    const elements = root.querySelectorAll<HTMLElement>(".dashboard-reveal");
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [loading, users.length]);

  if (loading) return <LoadingState />;
  if (error && !hasData) return <p role="alert" className="py-10 text-center text-red-600">{error}</p>;

  const totalRevenue = invoicesQuery.isError || paymentStatusesQuery.isError
    ? "Unavailable"
    : formatRevenue(invoices, paymentStatuses);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long" }).format(now);

  return (
    <main ref={dashboardRef} className="dashboard-overview -mx-4 -mt-5 min-h-[calc(100dvh-82px)] w-[calc(100%+2rem)] px-4 py-5 sm:-mx-7 sm:w-[calc(100%+3.5rem)] sm:px-7 lg:-mx-8 lg:w-[calc(100%+4rem)] lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 sm:space-y-6">
      {error && <p role="alert" className="dashboard-reveal rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Showing current users</p>}

      <header className="dashboard-reveal flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Welcome back, {admin?.name?.split(" ")[0] || "Admin"}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-sm text-slate-300">Here’s what’s happening with your MyLnder platform today.</p>
        </div>
        <p className="w-fit rounded-xl border border-orange-100 bg-white px-3 py-2 text-xs font-semibold text-myinder-muted shadow-sm sm:text-sm">
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(now)}
        </p>
      </header>

      <DashboardSummaryCards
        userCount={users.length}
        registrationTrend={registrationBuckets.map((bucket) => bucket.count)}
        registrationPeriod={registrationPeriod}
        invoicesLoading={invoicesQuery.isLoading}
        invoicesError={invoicesQuery.isError}
        successfulPayments={successfulPayments}
        pendingPayments={pendingPayments}
        paymentStatusTrend={visibleStatuses.map((status) => paymentCounts.get(status) ?? 0)}
        universitiesLoading={universitiesQuery.isLoading}
        universitiesError={universitiesQuery.isError}
        universityCount={universitiesQuery.data?.length ?? 0}
        universityTrend={universityCounts.map((university) => university.count)}
        revenueLoading={invoicesQuery.isLoading || paymentStatusesQuery.isLoading}
        revenueError={invoicesQuery.isError || paymentStatusesQuery.isError}
        totalRevenue={totalRevenue}
        revenueTrend={revenuePoints.map((point) => point.amount)}
        revenuePeriod={period}
      />

      {(invoicesQuery.isError || paymentStatusesQuery.isError || universitiesQuery.isError) && (
        <p role="alert" className="dashboard-reveal rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some overview totals could not be loaded.
          {invoicesQuery.isError && " Invoice totals are unavailable."}
          {paymentStatusesQuery.isError && " Payment statuses are unavailable."}
          {universitiesQuery.isError && " School totals are unavailable."}
        </p>
      )}

      <section className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <DashboardRevenueChart
          points={revenuePoints}
          period={period}
          onPeriodChange={setPeriod}
          currency={currency}
          currencies={currencies}
          onCurrencyChange={setSelectedCurrency}
          loading={invoicesQuery.isLoading || paymentStatusesQuery.isLoading}
          error={invoicesQuery.isError}
          monthLabel={monthLabel}
          year={now.getFullYear()}
          formatMoney={formatMoney}
        />

        <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <Link to="/admin/invoices" className="dashboard-reveal min-w-0 rounded-2xl border border-orange-100 bg-white p-4 shadow-soft transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-myinder-blue sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-myinder-navy">Order / payment status</h2>
                <p className="mt-1 text-xs text-myinder-muted">Distribution of invoice statuses</p>
              </div>
              <FileText size={19} className="text-myinder-blue" />
            </div>
            <div className="mt-4 flex items-center justify-center gap-4 sm:gap-6">
              <div
                className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full sm:h-36 sm:w-36"
                style={{ background: paymentTotal ? `conic-gradient(${paymentSegments.join(", ")})` : "conic-gradient(#eaf1fa 0% 100%)" }}
                role="img"
                aria-label={`${paymentTotal} invoices, ${successfulPayments} successful, ${pendingPayments} pending`}
              >
                <div className="grid h-[4.5rem] w-[4.5rem] place-content-center rounded-full bg-white text-center">
                  <span className="text-lg font-extrabold tabular-nums text-myinder-navy">{paymentTotal.toLocaleString()}</span>
                  <span className="text-[10px] text-myinder-muted">Invoices</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-[11px] sm:text-xs">
                {visibleStatuses.map((status) => (
                  <li key={status} className="flex min-w-0 items-center gap-2 text-myinder-muted">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColors[status] }} />
                    <span className="truncate">{status[0].toUpperCase() + status.slice(1)}</span>
                    <span className="ml-auto font-bold tabular-nums text-myinder-navy">{paymentCounts.get(status) ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
            {paymentStatusesQuery.isError && <p className="mt-3 text-xs text-amber-800">Payment statuses unavailable.</p>}
          </Link>

          <section className="dashboard-reveal min-w-0 rounded-2xl border border-orange-100 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4">
              <h2 className="font-bold text-myinder-navy">Monthly goals</h2>
              <p className="mt-1 text-xs text-myinder-muted">This month compared with the same dates last month.</p>
            </div>
            <div className="space-y-4">
              {monthMetrics.map((metric) => {
                const scale = Math.max(metric.amount, metric.previousAmount, 1);
                const width = metric.amount ? Math.max(3, (metric.amount / scale) * 100) : 0;
                return (
                  <div key={metric.label}>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-myinder-navy">{metric.label}</span>
                      <span className="text-right text-[10px] font-semibold tabular-nums text-myinder-muted sm:text-xs">
                        {metric.value} <span className="font-normal">/ {metric.previousValue}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-orange-50">
                      <div className="dashboard-chart-bar h-full rounded-full bg-[#c68a50]" style={{ width: `${width}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-myinder-muted">{getChange(metric.amount, metric.previousAmount)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dashboard-reveal min-w-0 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-soft sm:col-span-2 xl:col-span-1">
            <div className="flex items-center justify-between gap-3 border-b border-orange-50 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-bold text-myinder-navy">Recent transactions</h2>
                <p className="mt-1 text-xs text-myinder-muted">Latest invoice activity</p>
              </div>
              <Link to="/admin/invoices" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-myinder-blue hover:underline">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {invoicesQuery.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-myinder-muted">Loading transactions...</p>
            ) : invoicesQuery.isError ? (
              <p role="alert" className="px-4 py-6 text-center text-sm text-amber-800">Transactions are unavailable.</p>
            ) : recentInvoices.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-[11px]">
                  <thead className="bg-orange-50/60 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Invoice</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Amount</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50">
                    {recentInvoices.map((invoice) => {
                      const status = getInvoiceStatus(invoice, paymentStatuses);
                      return (
                        <tr key={invoice.invoiceId ?? invoice.invoiceNumber}>
                          <td className="max-w-24 truncate px-3 py-2.5 font-semibold text-myinder-navy">{invoice.invoiceNumber || "Invoice"}</td>
                          <td className="max-w-28 truncate px-3 py-2.5 text-myinder-muted">{invoice.customerEmail || "Customer"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-myinder-navy">
                            {invoice.amountMinor !== undefined && invoice.currency
                              ? new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency }).format(invoice.amountMinor / 100)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: statusColors[status], backgroundColor: `${statusColors[status]}18` }}>
                              {status[0].toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-myinder-muted">{formatDate(invoice.paidAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-myinder-muted">No transactions available.</p>
            )}
          </section>
        </div>
      </section>

      <DashboardCommunitySection
        universityCounts={universityCounts}
        studyAreaCount={new Set(users.map((user) => user.major).filter(Boolean)).size}
        imageCount={users.reduce((sum, user) => sum + user.images.length, 0)}
        userCount={users.length}
      />

      <DashboardRegistrationSection
        buckets={registrationBuckets}
        period={registrationPeriod}
        onPeriodChange={setRegistrationPeriod}
        registeredCount={registeredInPeriod}
        hasRegistrationDates={hasRegistrationDates}
        maxRegistrationCount={maxRegistrationCount}
      />

      <DashboardRecentUsers users={users} />
      </div>
    </main>
  );
}
