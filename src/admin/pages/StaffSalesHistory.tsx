import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShoppingCart, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import Modal from "../../components/ui/Modal";
import { getAdmins } from "../services/adminAuthService";
import { getSales, type Sale } from "../services/salesService";
import { getUniversities } from "../services/universitiesService";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

interface Filters {
  staffId: string;
  from: string;
  to: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatSaleTime(sale: Sale): string {
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(sale.time)) return sale.time.slice(0, 5);
  const timestamp = new Date(`${sale.sale_date}T${sale.time}`);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: "Africa/Nairobi" }).format(timestamp)
    : sale.time;
}

export default function StaffSalesHistory() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [filters, setFilters] = useState<Filters>({ staffId: "", from: "", to: "" });
  const [draft, setDraft] = useState(filters);
  const [filterError, setFilterError] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const adminsQuery = useQuery({
    queryKey: ["admin-directory", "staff-sales-history"],
    queryFn: async () => {
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      const firstPage = await getAdmins(accessToken, 1, "");
      const admins = [...firstPage.admins];
      for (let page = 2; page <= firstPage.totalPages; page += 1) {
        admins.push(...(await getAdmins(accessToken, page, "")).admins);
      }
      return admins.filter((admin) => !isSuperAdmin(admin));
    },
    staleTime: 60_000,
  });
  const salesQuery = useQuery({
    queryKey: ["admin-sales", "staff-history"],
    queryFn: getSales,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const universitiesQuery = useQuery({
    queryKey: ["admin-universities"],
    queryFn: getUniversities,
    staleTime: 60_000,
  });

  const staffNames = useMemo(
    () => new Map((adminsQuery.data ?? []).map((admin) => [admin.id, admin.name])),
    [adminsQuery.data],
  );
  const universityNames = useMemo(
    () => new Map((universitiesQuery.data ?? []).map((university) => [university.id, university.name])),
    [universitiesQuery.data],
  );
  const rows = useMemo(() => (salesQuery.data ?? [])
    .filter((sale) =>
      (!filters.staffId || sale.admin_id === filters.staffId) &&
      (!filters.from || sale.sale_date >= filters.from) &&
      (!filters.to || sale.sale_date <= filters.to),
    )
    .sort((left, right) =>
      `${right.sale_date}T${right.time}`.localeCompare(`${left.sale_date}T${left.time}`),
    ), [filters, salesQuery.data]);
  const total = rows.reduce((sum, sale) => sum + sale.amount, 0);

  useToastFeedback(
    filterError ||
      salesQuery.error?.message ||
      adminsQuery.error?.message ||
      universitiesQuery.error?.message,
  );

  useEffect(() => {
    if (!selectedSale) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSale(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedSale]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    setFilterError("");
    setFilters(draft);
  }

  function resetFilters() {
    const emptyFilters = { staffId: "", from: "", to: "" };
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setFilterError("");
  }

  const pending = salesQuery.isPending || adminsQuery.isPending;
  const error = salesQuery.error || adminsQuery.error;

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Staff sales</h1>
          <p className="mt-1 text-sm text-slate-300">Review sales recorded by staff and filter by staff member or date.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void Promise.all([
            salesQuery.refetch(),
            adminsQuery.refetch(),
            universitiesQuery.refetch(),
          ])}
          disabled={salesQuery.isFetching || adminsQuery.isFetching || universitiesQuery.isFetching}
        >
          <RefreshCw
            size={17}
            className={salesQuery.isFetching || adminsQuery.isFetching || universitiesQuery.isFetching ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 sm:p-6">
        <form onSubmit={applyFilters}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Staff member</span>
              <select
                value={draft.staffId}
                onChange={(event) => setDraft((current) => ({ ...current, staffId: event.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-sky-400"
              >
                <option value="">All staff</option>
                {(adminsQuery.data ?? []).map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.name}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-semibold text-slate-300">From</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-sky-400"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-semibold text-slate-300">To</span>
              <input
                type="date"
                value={draft.to}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-sky-400"
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit">Apply filters</Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>Reset</Button>
          </div>
        </form>
      </section>

      {pending ? <LoadingState label="Loading staff sales..." /> : error ? null : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sales total</p>
              <p className="mt-2 text-3xl font-extrabold text-emerald-300">{formatCurrency(total)}</p>
            </article>
            <article className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Records</p>
              <p className="mt-2 text-3xl font-extrabold text-emerald-300">
                {rows.length} {rows.length === 1 ? "sale" : "sales"}
              </p>
            </article>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
            <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-4">
              <ShoppingCart size={19} className="text-sky-300" />
              <h2 className="text-lg font-bold text-white">Sales history</h2>
            </div>
            {rows.length ? (
              <>
              <ul className="divide-y divide-slate-700 sm:hidden">
                {rows.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {staffNames.get(sale.admin_id) ?? sale.admin_id}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {sale.sale_date} · {sale.payment_method}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold text-emerald-300">{formatCurrency(sale.amount)}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSale(sale)}
                        className="sale-details-button rounded-lg border px-3 py-1.5 text-xs font-semibold text-sky-100 shadow-sm transition"
                        aria-label={`View sale ${sale.id}`}
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th scope="col" className="px-5 py-4">Date</th>
                      <th scope="col" className="px-5 py-4">Time</th>
                      <th scope="col" className="px-5 py-4">Staff</th>
                      <th scope="col" className="px-5 py-4">University</th>
                      <th scope="col" className="px-5 py-4">Payment method</th>
                      <th scope="col" className="px-5 py-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700 text-slate-200">
                    {rows.map((sale) => (
                      <tr key={sale.id}>
                        <td className="whitespace-nowrap px-5 py-4">{sale.sale_date}</td>
                        <td className="whitespace-nowrap px-5 py-4">{formatSaleTime(sale)}</td>
                        <td className="px-5 py-4">{staffNames.get(sale.admin_id) ?? sale.admin_id}</td>
                        <td className="px-5 py-4">{universityNames.get(sale.university_id) ?? sale.university_id}</td>
                        <td className="px-5 py-4">{sale.payment_method}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-emerald-300">
                          {formatCurrency(sale.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : (
              <p className="px-5 py-12 text-center text-sm text-slate-400">
                No sales match the selected filters.
              </p>
            )}
          </section>
        </>
      )}
      {selectedSale && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-sale-details-title"
            className="mobile-dialog-height relative w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 text-white shadow-2xl sm:p-7"
          >
            <button
              type="button"
              onClick={() => setSelectedSale(null)}
              aria-label="Close sale details"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            >
              <X size={20} />
            </button>
            <div className="pr-12">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Sale details</p>
              <h2 id="staff-sale-details-title" className="mt-1 text-xl font-bold">Recorded sale</h2>
              <p className="mt-2 text-3xl font-extrabold text-emerald-300">{formatCurrency(selectedSale.amount)}</p>
            </div>
            <dl className="mt-6 divide-y divide-slate-700 rounded-xl border border-slate-700 px-4">
              {[
                ["Date", selectedSale.sale_date],
                ["Time", formatSaleTime(selectedSale)],
                ["Staff member", staffNames.get(selectedSale.admin_id) ?? selectedSale.admin_id],
                ["University", universityNames.get(selectedSale.university_id) ?? selectedSale.university_id],
                ["Payment method", selectedSale.payment_method],
                ["Sale ID", selectedSale.id],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="max-w-[65%] break-all text-right font-medium text-slate-100">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedSale(null)}>Close</Button>
            </div>
          </section>
        </Modal>
      )}
    </main>
  );
}
