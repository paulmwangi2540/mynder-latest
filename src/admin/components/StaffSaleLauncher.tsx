import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, RefreshCw, X } from "lucide-react";
import { createSale, PAYMENT_METHODS, type PaymentMethod, type Sale } from "../services/salesService";
import { getUniversities } from "../services/universitiesService";
import type { AdminAccount } from "../services/adminAuthService";

const SALES_KEY = ["admin-sales"] as const;
export const OPEN_STAFF_SALE_EVENT = "mylnder:open-staff-sale";

export function openStaffSaleForm(saleDate?: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_STAFF_SALE_EVENT, { detail: { saleDate } }));
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

function getTodayInNairobi(): string {
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

export default function StaffSaleLauncher({
  admin,
  canRecord,
  previousDay,
  allowPreviousDaySale,
}: {
  admin: AdminAccount;
  canRecord: boolean;
  previousDay: string;
  allowPreviousDaySale: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState(getTodayInNairobi);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const schoolsQuery = useQuery({
    queryKey: ["admin-sales", admin.id, "assigned-schools", admin.schoolIds.join(",")],
    queryFn: () => getStaffUniversities(admin),
    staleTime: 60_000,
  });
  const schools = schoolsQuery.data ?? [];
  const canRecordSale =
    canRecord || (allowPreviousDaySale && saleDate === previousDay);

  useEffect(() => {
    const openSaleForm = (event: Event) => {
      const requestedDate = (event as CustomEvent<{ saleDate?: string }>).detail?.saleDate;
      setSaleDate(requestedDate ?? getTodayInNairobi());
      setError("");
      setOpen(true);
    };
    window.addEventListener(OPEN_STAFF_SALE_EVENT, openSaleForm);
    return () => window.removeEventListener(OPEN_STAFF_SALE_EVENT, openSaleForm);
  }, []);

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const parsedAmount = Number(amount);
    if (!canRecordSale) {
      setError("Clock in and resume work before recording a sale.");
      return;
    }
    if (!universityId || !paymentMethod || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Select an assigned university and payment method, then enter an amount greater than zero.");
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
      setAmount("");
      setUniversityId("");
      setPaymentMethod("");
      setSaleDate(getTodayInNairobi());
      setOpen(false);
      setNotice(`Sale recorded for ${formatCurrency(created.amount)}.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to record the sale.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {notice && (
        <div role="status" className="safe-area-inset-y fixed bottom-24 right-5 z-40 max-w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-emerald-800 bg-[#0c1b2b] px-4 py-3 text-sm text-emerald-200 shadow-xl">
          {notice}
        </div>
      )}
      <button
        type="button"
        aria-label="Add sale"
        title="Add sale"
        onClick={() => {
          setError("");
          setSaleDate(canRecord ? getTodayInNairobi() : allowPreviousDaySale ? previousDay : getTodayInNairobi());
          setOpen(true);
        }}
        className="safe-area-bottom fixed right-5 z-40 grid h-16 w-16 place-items-center rounded-full border-4 border-emerald-950 bg-[#20e43c] text-slate-950 shadow-[0_8px_24px_rgba(32,228,60,0.28)] transition hover:scale-105 hover:bg-[#29f044] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60"
      >
        <Plus size={29} strokeWidth={2.8} />
      </button>

      {open && (
        <div
          className="safe-area-padding fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-add-sale-title"
            className="safe-area-padding max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-slate-700 bg-[#0d1729] p-4 shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-6"
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-600 sm:hidden" />
            <header className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Sales</p>
                <h2 id="staff-add-sale-title" className="mt-1 text-2xl font-extrabold text-white">Add Sale</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setOpen(false);
                  setError("");
                }}
                disabled={saving}
                aria-label="Close add sale"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <X size={21} />
              </button>
            </header>
            {error && <p role="alert" className="mb-4 rounded-xl border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-200">{error}</p>}
            {!canRecord && allowPreviousDaySale && saleDate === previousDay && (
              <p className="mb-4 rounded-xl border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-200">
                This entry will be recorded for the previous day, before you clock in.
              </p>
            )}
            {!canRecord && !canRecordSale && (
              <p className="mb-4 rounded-xl border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-200">
                Clock in and resume work before recording a sale.
              </p>
            )}
            <form onSubmit={(event) => void submitSale(event)} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">University</span>
                <select
                  required
                  value={universityId}
                  onChange={(event) => setUniversityId(event.target.value)}
                  disabled={saving || schoolsQuery.isPending || schools.length === 0 || !canRecordSale}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-[#101b2d] px-3 text-base text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                >
                  <option value="">{schoolsQuery.isPending ? "Loading assigned universities…" : "Select university…"}</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
                {schoolsQuery.isError && <span className="mt-1 block text-xs text-rose-300">Assigned universities could not be loaded.</span>}
                {!schoolsQuery.isPending && !schoolsQuery.isError && schools.length === 0 && (
                  <span className="mt-1 block text-xs text-amber-300">No assigned universities are available.</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Payment Method</span>
                <select
                  required
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}
                  disabled={saving || !canRecordSale}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-[#101b2d] px-3 text-base text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                >
                  <option value="">Select payment method…</option>
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Amount (USD)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={saving || !canRecordSale}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-[#101b2d] px-3 text-base text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                />
              </label>
              <p className="rounded-xl bg-indigo-950/40 px-3 py-2.5 text-xs text-slate-400">
                {canRecord || saleDate !== previousDay
                  ? "Recorded automatically in Kenya Time (EAT)."
                  : `Date: ${saleDate} (previous day, Kenya Time).`}
              </p>
              <button
                type="submit"
                disabled={saving || schoolsQuery.isPending || !schools.length || !canRecordSale}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#20e43c] px-4 text-sm font-extrabold text-slate-950 transition hover:bg-[#29f044] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Banknote size={16} />}
                {saving ? "Recording sale..." : "Add Sale"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
