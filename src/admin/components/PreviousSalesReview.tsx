import { useMemo, useState } from "react";
import { AlertCircle, Check, ClipboardCheck } from "lucide-react";
import Button from "../../components/ui/Button";
import { getPreviousNairobiDate, reviewPreviousSales } from "../services/previousSalesReview";
import usePreviousSalesReviewStatus from "../hooks/usePreviousSalesReviewStatus";
import type { Sale } from "../services/salesService";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeZone: "Africa/Nairobi",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default function PreviousSalesReview({
  adminId,
  sales,
  loading,
  error,
  onAddSale,
}: {
  adminId: string;
  sales: Sale[];
  loading: boolean;
  error?: string;
  onAddSale: (saleDate: string) => void;
}) {
  const saleDate = getPreviousNairobiDate();
  const [reviewError, setReviewError] = useState("");
  const reviewed = usePreviousSalesReviewStatus(adminId, saleDate);
  const daySales = useMemo(
    () => sales.filter((sale) => sale.admin_id === adminId && sale.sale_date === saleDate),
    [adminId, saleDate, sales],
  );
  const total = daySales.reduce((sum, sale) => sum + sale.amount, 0);

  function confirmSales() {
    setReviewError("");
    try {
      reviewPreviousSales(adminId, saleDate, daySales);
    } catch (cause: unknown) {
      setReviewError(cause instanceof Error ? cause.message : "Unable to confirm yesterday’s sales.");
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 text-sm text-slate-300 sm:p-5" aria-live="polite">
        Checking previous-day sales before clock-in…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-900 bg-rose-950/30 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-rose-200"><AlertCircle size={17} /> Previous-day sales could not be verified.</p>
        <p className="mt-1 text-xs text-rose-200/80">{error}</p>
        <p className="mt-2 text-xs text-slate-300">Clock-in is disabled until sales can be checked.</p>
      </section>
    );
  }

  if (reviewed && daySales.length > 0) {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200" role="status">
        <Check size={17} /> {formatDate(saleDate)} sales confirmed. You can clock in.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-800 bg-amber-950/25 p-4 sm:p-5" aria-labelledby="previous-sales-review-title">
      <div className="flex items-start gap-3">
        <ClipboardCheck size={20} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h2 id="previous-sales-review-title" className="font-bold text-white">
            Review sales for {formatDate(saleDate)}
          </h2>
          {daySales.length ? (
            <>
              <p className="mt-1 text-sm text-slate-300">
                {daySales.length} {daySales.length === 1 ? "sale" : "sales"} recorded · {formatCurrency(total)} total.
                Review the entries, then confirm to unlock clock-in.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-300">
                {daySales.map((sale) => (
                  <li key={sale.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <span>{sale.payment_method}</span>
                    <span>{formatCurrency(sale.amount)}</span>
                  </li>
                ))}
              </ul>
              <Button type="button" onClick={confirmSales} className="mt-4">
                <Check size={16} /> Confirm previous-day sales
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-300">
                No sales are recorded for this day. Add the previous day’s sale before confirming and clocking in.
              </p>
              <Button type="button" onClick={() => onAddSale(saleDate)} className="mt-4">
                Add previous-day sale
              </Button>
            </>
          )}
          {reviewError && <p role="alert" className="mt-3 text-sm text-rose-300">{reviewError}</p>}
        </div>
      </div>
    </section>
  );
}
