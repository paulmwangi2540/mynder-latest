import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Apple, Banknote, CreditCard, Download, History, Plus, Wallet } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import { getUniversities } from "../services/universitiesService";
import {
  createSale,
  getSales,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Sale,
} from "../services/salesService";
import type { AdminAccount } from "../services/adminAuthService";
import useToastFeedback from "../../hooks/useToastFeedback";

const SALES_KEY = ["admin-sales"] as const;

function getNairobiDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function methodIcon(method: PaymentMethod) {
  if (method === "Cash App") return Banknote;
  if (method === "PayPal") return CreditCard;
  if (method === "Apple Pay") return Apple;
  return Wallet;
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

export default function StaffSales({
  admin,
  canRecord,
}: {
  admin: AdminAccount;
  canRecord: boolean;
}) {
  const queryClient = useQueryClient();
  const initialDate = useMemo(getNairobiDate, []);
  const [reportDate, setReportDate] = useState(initialDate);
  const [universityId, setUniversityId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState(initialDate);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const salesQuery = useQuery({
    queryKey: [...SALES_KEY, admin.id],
    queryFn: getSales,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const schoolsQuery = useQuery({
    queryKey: ["admin-sales", admin.id, "assigned-schools", admin.schoolIds.join(",")],
    queryFn: () => getStaffUniversities(admin),
    staleTime: 60_000,
  });

  const schools = schoolsQuery.data ?? [];
  const sales = salesQuery.data ?? [];
  const dailySales = useMemo(
    () => sales.filter((sale) => sale.sale_date === reportDate),
    [reportDate, sales],
  );
  const totalsByMethod = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>(
      PAYMENT_METHODS.map((method) => [method, { amount: 0, count: 0 }]),
    );
    for (const sale of dailySales) {
      const current = totals.get(sale.payment_method) ?? { amount: 0, count: 0 };
      totals.set(sale.payment_method, {
        amount: current.amount + sale.amount,
        count: current.count + 1,
      });
    }
    return totals;
  }, [dailySales]);
  const dailyTotal = dailySales.reduce((sum, sale) => sum + sale.amount, 0);
  const sortedSales = useMemo(
    () => [...sales].sort((a, b) => `${b.sale_date}T${b.time}`.localeCompare(`${a.sale_date}T${a.time}`)),
    [sales],
  );
  useToastFeedback(
    actionError || salesQuery.error?.message || schoolsQuery.error?.message,
    notice,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    if (!canRecord) {
      setActionError("Clock in and resume work before recording a sale.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!universityId || !paymentMethod || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError("Select an assigned university and payment method, then enter an amount greater than zero.");
      return;
    }
    if (!saleDate) {
      setActionError("Enter a valid sale date.");
      return;
    }

    setSaving(true);
    try {
      const created = await createSale({
        university_id: universityId,
        payment_method: paymentMethod,
        amount: parsedAmount,
        sale_date: saleDate,
      });
      queryClient.setQueryData<Sale[]>(
        [...SALES_KEY, admin.id],
        (current) => [...(current ?? []).filter((sale) => sale.id !== created.id), created],
      );
      await queryClient.invalidateQueries({ queryKey: [...SALES_KEY, admin.id] });
      setReportDate(saleDate);
      setAmount("");
      setNotice(`Sale recorded for ${formatCurrency(created.amount)}.`);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to record the sale.");
    } finally {
      setSaving(false);
    }
  }

  function getUniversityName(sale: Sale): string {
    return schools.find((school) => school.id === sale.university_id)?.name ?? "Assigned university";
  }

  function exportSalesHistory() {
    setActionError("");
    try {
      const csvCell = (value: string | number) => {
        const text = String(value);
        const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
      };
      const csv = [
        ["Sale date", "Time", "University", "University ID", "Payment method", "Amount", "Sale ID"].map(csvCell).join(","),
        ...sortedSales.map((sale) => [
          sale.sale_date,
          sale.time,
          getUniversityName(sale),
          sale.university_id,
          sale.payment_method,
          sale.amount.toFixed(2),
          sale.id,
        ].map(csvCell).join(",")),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `mylnder-sales-history-${admin.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to export sales history.");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-white">Daily sales</h2>
          <p className="mt-1 text-xs text-slate-400">Record sales by assigned university and payment method.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Summary date</span>
          <input
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-base text-white outline-none focus:border-sky-400 sm:text-sm"
          />
        </label>
      </header>

      {salesQuery.isPending ? (
        <LoadingState label="Loading sales..." />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
          {PAYMENT_METHODS.map((method) => {
            const Icon = methodIcon(method);
            const totals = totalsByMethod.get(method) ?? { amount: 0, count: 0 };
            return (
              <article key={method} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3.5 sm:p-4">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white sm:text-base">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-emerald-300"><Icon size={17} /></span>
                  <span className="truncate">{method}</span>
                </h3>
                <p className="mt-3 text-xl font-extrabold tabular-nums text-emerald-400">{formatCurrency(totals.amount)}</p>
                <p className="mt-1 text-xs text-slate-400">{totals.count} {totals.count === 1 ? "sale" : "sales"}</p>
              </article>
            );
          })}
          <article className="col-span-2 rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3.5 sm:col-span-1 sm:p-4">
            <h3 className="text-sm font-semibold text-emerald-100 sm:text-base">Daily total</h3>
            <p className="mt-3 text-xl font-extrabold tabular-nums text-emerald-300">{formatCurrency(dailyTotal)}</p>
            <p className="mt-1 text-xs text-emerald-100/70">{dailySales.length} {dailySales.length === 1 ? "sale" : "sales"}</p>
          </article>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 border-t border-slate-700 p-4 sm:p-5 lg:grid-cols-6">
        <label className="block min-w-0 lg:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Assigned university</span>
          <select
            required
            value={universityId}
            onChange={(event) => setUniversityId(event.target.value)}
            disabled={!canRecord || schoolsQuery.isPending || schools.length === 0 || saving}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-white outline-none focus:border-sky-400 disabled:opacity-50 sm:text-sm"
          >
            <option value="">{schoolsQuery.isPending ? "Loading assigned universities…" : "Select university"}</option>
            {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Payment method</span>
          <select
            required
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}
            disabled={!canRecord || saving}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-white outline-none focus:border-sky-400 disabled:opacity-50 sm:text-sm"
          >
            <option value="">Select method</option>
            {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Amount</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={!canRecord || saving}
            placeholder="125.50"
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-50 sm:text-sm"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Sale date</span>
          <input
            type="date"
            required
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
            disabled={!canRecord || saving}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-white outline-none focus:border-sky-400 disabled:opacity-50 sm:text-sm"
          />
        </label>
        <div className="flex flex-wrap items-end gap-3 lg:col-span-6">
          <Button type="submit" disabled={!canRecord || saving || schoolsQuery.isPending || schools.length === 0}>
            {saving ? <Wallet size={16} className="animate-pulse" /> : <Plus size={16} />}
            {saving ? "Recording sale..." : "Record sale"}
          </Button>
          {!canRecord && <p className="text-xs text-amber-300">Clock in and resume work to record sales.</p>}
          {!schoolsQuery.isPending && !schoolsQuery.isError && schools.length === 0 && (
            <p className="text-xs text-amber-300">No assigned universities are available for recording sales.</p>
          )}
        </div>
      </form>

      <div className="border-t border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <h3 className="font-semibold text-white">Sales on {reportDate}</h3>
          <span className="text-xs text-slate-400">{dailySales.length} records · {formatCurrency(dailyTotal)}</span>
        </div>
        {salesQuery.isError ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Sales records are unavailable right now.</p>
        ) : dailySales.length ? (
          <ul className="divide-y divide-slate-700">
            {[...dailySales].sort((a, b) => `${b.sale_date}T${b.time}`.localeCompare(`${a.sale_date}T${a.time}`)).map((sale) => (
              <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{getUniversityName(sale)}</p>
                  <p className="mt-1 text-xs text-slate-400">{sale.payment_method} · {sale.time.slice(0, 5)}</p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-emerald-300">{formatCurrency(sale.amount)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-400">No sales recorded for this date.</p>
        )}
      </div>
      <div className="border-t border-slate-700 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Sales history</h3>
            <p className="mt-1 text-xs text-slate-400">All {sales.length} sales recorded for your account.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={exportSalesHistory} disabled={!sales.length || salesQuery.isError}>
              <Download size={16} /> Export CSV
            </Button>
            <Button type="button" variant="secondary" onClick={() => setHistoryOpen((open) => !open)}>
              <History size={16} /> {historyOpen ? "Hide history" : "View all sale history"}
            </Button>
          </div>
        </div>
        {historyOpen && (
          salesQuery.isPending ? (
            <LoadingState label="Loading sales history..." />
          ) : salesQuery.isError ? (
            <p className="mt-4 text-sm text-slate-400">Sales history is unavailable right now.</p>
          ) : sortedSales.length ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date / time</th>
                    <th className="px-4 py-3 font-semibold">University</th>
                    <th className="px-4 py-3 font-semibold">Payment method</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {sortedSales.map((sale) => (
                    <tr key={sale.id} className="text-slate-200">
                      <td className="whitespace-nowrap px-4 py-3">{sale.sale_date} · {sale.time.slice(0, 5)}</td>
                      <td className="px-4 py-3">{getUniversityName(sale)}</td>
                      <td className="px-4 py-3">{sale.payment_method}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(sale.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No sales have been recorded yet.</p>
          )
        )}
      </div>
    </section>
  );
}
