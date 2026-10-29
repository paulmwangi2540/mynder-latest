import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";
import { CalendarDays, Download, Eye, Plus, RefreshCw, Trash2, X } from "lucide-react";

import LoadingState from "../../components/shared/LoadingState";
import Button from "../../components/ui/Button";
import { getAdmins, type AdminAccount } from "../services/adminAuthService";
import {
  getManualExpenses,
  getRentPayments,
  getSalaryPayments,
} from "../services/expensesService";
import { getSales } from "../services/salesService";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";
import {
  createFinanceReport,
  deleteFinanceReport,
  getFinanceReport,
  getFinanceReports,
  refreshFinanceReport,
  type FinanceReport,
} from "../services/financeReportsService";

type ReportType = "Expenses" | "Sales";
type QuickRange = "Today" | "Last 7 days" | "Last 30 days" | "This Month" | "All Time" | "Custom";

interface ReportFilters {
  reportType: ReportType;
  staffId: string;
  from: string;
  to: string;
  quickRange: QuickRange;
}

interface ReportRow {
  id: string;
  date: string;
  category: string;
  staff: string;
  staffId: string;
  amount: number;
  note: string;
  period?: boolean;
}

const QUICK_RANGES: QuickRange[] = ["Today", "Last 7 days", "Last 30 days", "This Month", "All Time"];
const FINANCE_REPORTS_KEY = ["admin-finance-reports"] as const;

function getLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRange(range: QuickRange): Pick<ReportFilters, "from" | "to"> {
  const today = new Date();
  const to = getLocalDate(today);
  if (range === "All Time") return { from: "", to: "" };
  if (range === "This Month") {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, to };
  }
  const from = new Date(today);
  from.setDate(today.getDate() - (range === "Today" ? 0 : range === "Last 7 days" ? 6 : 29));
  return { from: getLocalDate(from), to };
}

function amountValue(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("A report record contains an invalid amount.");
  return amount;
}

function formatCurrency(value: number, currency: "USD" | "KES" = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

async function downloadExcel(reportType: ReportType, rows: ReportRow[]) {
  const zip = new JSZip();
  const workbookRows: (string | number)[][] = [
    ["Date", "Category", "Staff", "Amount (USD)", "Note"],
    ...rows.map((row) => [row.date, row.category, row.staff, row.amount, row.note]),
  ];
  const sheetRows = workbookRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder("xl")?.file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${reportType}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.folder("xl")?.folder("_rels")?.file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.folder("xl")?.folder("worksheets")?.file("sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mylnder-${reportType.toLowerCase()}-report.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function currentMonth(): string {
  return getLocalDate(new Date()).slice(0, 7);
}

function reportMonthLabel(value: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date)
    : value;
}

function FinancialReportsSection() {
  const queryClient = useQueryClient();
  const [reportPeriod, setReportPeriod] = useState(currentMonth);
  const [busyAction, setBusyAction] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const reportsQuery = useQuery({
    queryKey: FINANCE_REPORTS_KEY,
    queryFn: getFinanceReports,
    staleTime: 30_000,
  });
  const detailQuery = useQuery({
    queryKey: [...FINANCE_REPORTS_KEY, "detail", selectedReportId],
    queryFn: () => getFinanceReport(selectedReportId),
    enabled: Boolean(selectedReportId),
    staleTime: 30_000,
  });
  const reports = reportsQuery.data ?? [];
  useToastFeedback(actionError || reportsQuery.error?.message || detailQuery.error?.message || "", notice);

  async function createOrRecalculate() {
    setActionError("");
    setNotice("");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportPeriod)) {
      setActionError("Select a valid report month.");
      return;
    }
    const existing = reports.find((report) => report.report_period === reportPeriod);
    if (existing && !window.confirm(`Recalculate ${reportMonthLabel(reportPeriod)}? This replaces the saved totals using current source records.`)) return;
    setBusyAction("create");
    try {
      await createFinanceReport(reportPeriod);
      setNotice(`${reportMonthLabel(reportPeriod)} financial report generated.`);
      await queryClient.invalidateQueries({ queryKey: FINANCE_REPORTS_KEY });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to generate the financial report.");
    } finally {
      setBusyAction("");
    }
  }

  async function recalculate(report: FinanceReport) {
    setActionError("");
    setNotice("");
    setBusyAction(report.id);
    try {
      await refreshFinanceReport(report.id);
      setNotice(`${reportMonthLabel(report.report_period)} report refreshed.`);
      await queryClient.invalidateQueries({ queryKey: FINANCE_REPORTS_KEY });
      await queryClient.invalidateQueries({ queryKey: [...FINANCE_REPORTS_KEY, "detail", report.id] });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to refresh the financial report.");
    } finally {
      setBusyAction("");
    }
  }

  async function removeReport(report: FinanceReport) {
    if (!window.confirm(`Delete the ${reportMonthLabel(report.report_period)} summary? Source expenses and sales will not be deleted.`)) return;
    setActionError("");
    setNotice("");
    setBusyAction(report.id);
    try {
      await deleteFinanceReport(report.id);
      if (selectedReportId === report.id) setSelectedReportId("");
      setNotice(`${reportMonthLabel(report.report_period)} financial summary deleted.`);
      await queryClient.invalidateQueries({ queryKey: FINANCE_REPORTS_KEY });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete the financial report.");
    } finally {
      setBusyAction("");
    }
  }

  const detailMetrics: Array<[string, keyof FinanceReport, boolean]> = [
    ["Gross sales", "gross_sales", false],
    ["Payment deductions", "payment_deductions", false],
    ["Sales after fees", "sales_after_fees", false],
    ["Manual expenses", "manual_expenses", false],
    ["Rent expenses", "rent_expenses", false],
    ["Salary expenses", "salary_expenses", false],
    ["Total expenses", "total_expenses", false],
    ["Commission estimate", "total_commissions", false],
    ["Total costs", "total_costs", false],
    ["Total profit", "total_profit", true],
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-slate-700 bg-[#102237] p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-950 text-emerald-300">
            <CalendarDays size={20} />
          </span>
          <div>
            <h2 className="text-xl font-bold text-white">Financial reports</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-300">
              Business-wide monthly USD summaries. Commission is an estimate based on monthly sales and holidays, not saved payout records.
            </p>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(160px,1fr)_auto]">
          <label className="block min-w-0">
            <span className="sr-only">Financial report month</span>
            <input
              type="month"
              value={reportPeriod}
              onChange={(event) => setReportPeriod(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white outline-none focus:border-emerald-400 sm:text-sm"
            />
          </label>
          <Button type="button" onClick={() => void createOrRecalculate()} disabled={busyAction !== "" || !reportPeriod} className="w-full justify-center sm:w-auto">
            <Plus size={16} /> Generate / recalculate
          </Button>
        </div>
      </header>

      {reportsQuery.isPending ? (
        <LoadingState label="Loading financial reports..." />
      ) : reportsQuery.isError ? (
        <div className="rounded-xl border border-rose-900 bg-rose-950/30 p-5 text-sm text-rose-200">
          <p>Unable to load financial reports: {reportsQuery.error.message}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void reportsQuery.refetch()}>Try again</Button>
        </div>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-slate-700 p-8 text-center text-sm text-slate-300">No financial summaries yet. Choose a month to generate one.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {reports.map((report) => (
            <li key={report.id} className="min-w-0 rounded-xl border border-slate-700 bg-[#0b1828] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold text-white">{reportMonthLabel(report.report_period)}</h3>
                  <p className="mt-1 text-xs text-slate-400">{report.start_date} – {report.end_date}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${Number(report.total_profit) < 0 ? "bg-rose-950 text-rose-200" : "bg-emerald-950 text-emerald-200"}`}>
                  Profit {formatCurrency(Number(report.total_profit))}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {([
                  ["Sales after fees", report.sales_after_fees],
                  ["Expenses", report.total_expenses],
                  ["Commission estimate", report.total_commissions],
                  ["Total costs", report.total_costs],
                ] as const).map(([label, amount]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-slate-900/80 p-3">
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="mt-1 break-words font-semibold text-slate-100">{formatCurrency(Number(amount))}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-400">
                Calculated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.last_calculated_at))}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                <Button type="button" variant="secondary" onClick={() => setSelectedReportId(report.id)} className="flex-1 justify-center">
                  <Eye size={15} /> Details
                </Button>
                <Button type="button" variant="secondary" onClick={() => void recalculate(report)} disabled={busyAction !== ""} aria-label={`Refresh ${reportMonthLabel(report.report_period)}`} className="justify-center">
                  <RefreshCw size={15} className={busyAction === report.id ? "animate-spin" : ""} /> Refresh
                </Button>
                <Button type="button" variant="secondary" onClick={() => void removeReport(report)} disabled={busyAction !== ""} aria-label={`Delete ${reportMonthLabel(report.report_period)}`} className="justify-center">
                  <Trash2 size={15} /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedReportId("");
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="finance-report-detail-title" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#102237] p-4 shadow-2xl sm:p-6">
            <header className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Monthly financial summary</p>
                <h2 id="finance-report-detail-title" className="mt-1 break-words text-xl font-bold text-white">
                  {detailQuery.data ? reportMonthLabel(detailQuery.data.report_period) : "Loading report..."}
                </h2>
              </div>
              <button type="button" onClick={() => setSelectedReportId("")} aria-label="Close report details" className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20} /></button>
            </header>
            {detailQuery.isPending ? (
              <LoadingState label="Loading report details..." />
            ) : detailQuery.isError ? (
              <p role="alert" className="text-sm text-rose-200">{detailQuery.error.message}</p>
            ) : detailQuery.data ? (
              <>
                <p className="mb-4 text-sm text-slate-300">{detailQuery.data.start_date} – {detailQuery.data.end_date}</p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailMetrics.map(([label, field, highlight]) => (
                    <div key={field} className={`min-w-0 rounded-xl p-4 ${highlight ? "bg-emerald-950/60 ring-1 ring-emerald-800" : "bg-slate-900/80"}`}>
                      <dt className="text-sm text-slate-400">{label}</dt>
                      <dd className={`mt-1 break-words text-lg font-bold ${highlight && Number(detailQuery.data.total_profit) < 0 ? "text-rose-300" : "text-white"}`}>
                        {formatCurrency(Number(detailQuery.data[field]))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
          </section>
        </div>
      )}
    </section>
  );
}

export default function Reports() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    reportType: "Expenses",
    staffId: "",
    ...getRange("Last 7 days"),
    quickRange: "Last 7 days",
  }));
  const [draft, setDraft] = useState(filters);
  const [filterError, setFilterError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  const adminsQuery = useQuery({
    queryKey: ["admin-directory", "reports"],
    queryFn: async () => {
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      const first = await getAdmins(accessToken, 1, "");
      const admins = [...first.admins];
      for (let page = 2; page <= first.totalPages; page += 1) {
        admins.push(...(await getAdmins(accessToken, page, "")).admins);
      }
      return admins.filter((admin) => !isSuperAdmin(admin));
    },
    staleTime: 60_000,
  });
  const manualQuery = useQuery({
    queryKey: ["admin-expenses", "manual"],
    queryFn: getManualExpenses,
    enabled: filters.reportType === "Expenses",
    staleTime: 30_000,
  });
  const rentQuery = useQuery({
    queryKey: ["admin-rent-payments"],
    queryFn: getRentPayments,
    enabled: filters.reportType === "Expenses",
    staleTime: 30_000,
  });
  const salaryQuery = useQuery({
    queryKey: ["admin-salary-payments"],
    queryFn: getSalaryPayments,
    enabled: filters.reportType === "Expenses",
    staleTime: 30_000,
  });
  const salesQuery = useQuery({
    queryKey: ["admin-sales", "reports"],
    queryFn: getSales,
    enabled: filters.reportType === "Sales",
    staleTime: 30_000,
  });

  const admins = adminsQuery.data ?? [];
  const adminNames = useMemo(
    () => new Map(admins.map((admin: AdminAccount) => [admin.id, admin.name])),
    [admins],
  );
  const rows = useMemo<ReportRow[]>(() => {
    const expenseRows: ReportRow[] = [
      ...(manualQuery.data ?? []).map((item) => ({
        id: `manual-${item.id}`,
        date: item.expense_date,
        category: item.category,
        staffId: item.admin_id ?? "",
        staff: item.admin_id ? adminNames.get(item.admin_id) ?? item.admin_id : "—",
        amount: amountValue(item.amount_usd),
        note: item.note ?? "",
      })),
      ...(rentQuery.data ?? []).map((item) => ({
        id: `rent-${item.id}`,
        date: item.rent_period,
        category: "Rent",
        staffId: "",
        staff: "—",
        amount: amountValue(item.amount_usd),
        note: item.status,
        period: true,
      })),
      ...(salaryQuery.data ?? []).map((item) => ({
        id: `salary-${item.id}`,
        date: item.salary_period,
        category: "Salary",
        staffId: item.admin_id,
        staff: adminNames.get(item.admin_id) ?? item.admin_id,
        amount: amountValue(item.amount_usd),
        note: item.status,
        period: true,
      })),
    ];
    const salesRows: ReportRow[] = (salesQuery.data ?? []).map((sale) => ({
      id: `sale-${sale.id}`,
      date: sale.sale_date,
      category: sale.payment_method,
      staffId: sale.admin_id,
      staff: adminNames.get(sale.admin_id) ?? sale.admin_id,
      amount: sale.amount,
      note: sale.time,
    }));
    return (filters.reportType === "Expenses" ? expenseRows : salesRows)
      .filter((row) =>
        (!filters.staffId || row.staffId === filters.staffId) &&
        (!filters.from || (row.period ? row.date.slice(0, 7) >= filters.from.slice(0, 7) : row.date >= filters.from)) &&
        (!filters.to || (row.period ? row.date.slice(0, 7) <= filters.to.slice(0, 7) : row.date <= filters.to)),
      )
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [adminNames, filters, manualQuery.data, rentQuery.data, salaryQuery.data, salesQuery.data]);

  const queryError = filters.reportType === "Expenses"
    ? manualQuery.error ?? rentQuery.error ?? salaryQuery.error
    : salesQuery.error;
  const pending = filters.reportType === "Expenses"
    ? manualQuery.isPending || rentQuery.isPending || salaryQuery.isPending
    : salesQuery.isPending;
  useToastFeedback(
    filterError || exportError || adminsQuery.error?.message || queryError?.message || "",
  );

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    setFilterError("");
    setFilters(draft);
  }

  function selectRange(range: QuickRange) {
    const next = { ...draft, ...getRange(range), quickRange: range };
    setDraft(next);
    setFilters(next);
    setFilterError("");
  }

  function resetFilters() {
    const next: ReportFilters = {
      reportType: "Expenses",
      staffId: "",
      ...getRange("Last 7 days"),
      quickRange: "Last 7 days",
    };
    setDraft(next);
    setFilters(next);
    setFilterError("");
  }

  async function exportReport() {
    setExportError("");
    setExporting(true);
    try {
      await downloadExcel(filters.reportType, rows);
    } catch (cause: unknown) {
      setExportError(cause instanceof Error ? cause.message : "Unable to export this report.");
    } finally {
      setExporting(false);
    }
  }

  const reportIsFetching = filters.reportType === "Expenses"
    ? manualQuery.isFetching || rentQuery.isFetching || salaryQuery.isFetching
    : salesQuery.isFetching;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Reports</h1>
          <p className="mt-1 text-sm text-slate-300">{filters.reportType} · {filters.staffId ? adminNames.get(filters.staffId) ?? "Selected staff" : "All Staff"} · {filters.quickRange === "Custom" ? `${filters.from || "Beginning"} – ${filters.to || "Today"}` : filters.quickRange}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!rows.length || exporting || pending || Boolean(queryError)}
            className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={18} />
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
         
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-[#0b1828] p-5 sm:p-7">
        <form onSubmit={applyFilters}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Report Type</span>
              <select
                value={draft.reportType}
                onChange={(event) => setDraft((current) => ({ ...current, reportType: event.target.value as ReportType }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-white outline-none focus:border-green-400"
              >
                <option value="Expenses">Expenses</option>
                <option value="Sales">Sales</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Staff</span>
              <select
                value={draft.staffId}
                onChange={(event) => setDraft((current) => ({ ...current, staffId: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-white outline-none focus:border-green-400"
              >
                <option value="">All Staff</option>
                {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">From</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value, quickRange: "Custom" }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-white outline-none focus:border-green-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">To</span>
              <input
                type="date"
                value={draft.to}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value, quickRange: "Custom" }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-white outline-none focus:border-green-400"
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 hover:bg-green-400">Apply Filters</button>
            <button type="button" onClick={resetFilters} className="rounded-xl bg-slate-800 px-5 py-3 font-semibold text-white hover:bg-slate-700">Reset</button>
          </div>
        </form>
      </section>

      <nav aria-label="Quick date ranges" className="flex flex-wrap gap-2">
        {QUICK_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={filters.quickRange === range}
            onClick={() => selectRange(range)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filters.quickRange === range ? "bg-green-500 text-slate-950" : "bg-slate-800 text-white hover:bg-slate-700"}`}
          >
            {range}
          </button>
        ))}
      </nav>

      {pending ? <LoadingState label={`Loading ${filters.reportType.toLowerCase()} report...`} /> : queryError ? null : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-slate-800 bg-[#111c2e] p-6">
              <p className="text-sm uppercase tracking-wide text-slate-400">{filters.reportType} total (USD)</p>
              <p className="mt-3 text-3xl font-extrabold text-green-500">{formatCurrency(total)}</p>
            </article>
            <article className="rounded-2xl border border-slate-800 bg-[#111c2e] p-6">
              <p className="text-sm uppercase tracking-wide text-slate-400">Records</p>
              <p className="mt-3 text-3xl font-extrabold text-green-500">{rows.length} {filters.reportType.toLowerCase()} {rows.length === 1 ? "record" : "records"}</p>
            </article>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1828]">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-lg font-bold text-white">{filters.reportType}</h2>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      {["Date", "Category", "Staff", "Amount", "Note"].map((heading) => (
                        <th key={heading} scope="col" className="px-5 py-4 font-semibold uppercase">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-5 py-4">{row.date}</td>
                        <td className="px-5 py-4">{row.category}</td>
                        <td className="px-5 py-4">{row.staff}</td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold">{formatCurrency(row.amount)}</td>
                        <td className="px-5 py-4">{row.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-12 text-center text-sm text-slate-400">No {filters.reportType.toLowerCase()} records match these filters.</p>
            )}
          </section>
        </>
      )}
      {reportIsFetching && !pending && <p className="text-right text-xs text-slate-400">Refreshing report data…</p>}
      <FinancialReportsSection />
    </main>
  );
}
