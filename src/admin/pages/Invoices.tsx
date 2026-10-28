import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Download, ExternalLink, FileText, RefreshCw, XCircle } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import LoadingState from "../../components/shared/LoadingState";
import {
  getAdminPaymentStatuses,
  getInvoices,
  type UserInvoice,
} from "../services/invoicesService";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";
import { USER_DATA_STALE_TIME, userListQueryOptions } from "../hooks/useUsers";
import type { QueryClient } from "@tanstack/react-query";

interface InvoiceRow {
  id: string;
  userName: string;
  invoice: UserInvoice;
  paymentStatus?: UserInvoice["status"];
}

type InvoiceStatus = UserInvoice["status"];

const statusPresentation: Record<
  InvoiceStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  successful: {
    label: "Succeeded",
    className: "bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700",
    Icon: Clock3,
  },
  failed: {
    label: "Failed",
    className: "bg-rose-50 text-rose-700",
    Icon: XCircle,
  },
  canceled: {
    label: "Canceled",
    className: "bg-slate-100 text-slate-600",
    Icon: XCircle,
  },
  refunded: {
    label: "Refunded",
    className: "bg-violet-50 text-violet-700",
    Icon: CheckCircle2,
  },
  unknown: {
    label: "Unknown",
    className: "bg-slate-100 text-slate-600",
    Icon: AlertCircle,
  },
};

interface InvoiceListResult {
  rows: InvoiceRow[];
  dataWarning: string;
}

async function loadInvoiceRows(
  refresh: boolean,
  adminId: string | undefined,
  queryClient: QueryClient,
): Promise<InvoiceListResult> {
  const [invoices, userResult, paymentResult] = await Promise.all([
    getInvoices(),
    (adminId
      ? queryClient.fetchQuery({
          ...userListQueryOptions(adminId),
          staleTime: refresh ? 0 : USER_DATA_STALE_TIME,
        })
      : Promise.reject(new Error("Unable to identify the signed-in admin."))).then(
      (users) => ({ users, error: "" }),
      (cause: unknown) => ({
        users: [],
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to match invoice records to users.",
      }),
    ),
    getAdminPaymentStatuses().then(
      (statuses) => ({ statuses, error: "" }),
      (cause: unknown) => ({
        statuses: new Map<string, UserInvoice["status"]>(),
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load linked payment statuses.",
      }),
    ),
  ]);
  const usersById = new Map(userResult.users.map((user) => [user.id, user]));

  return {
    rows: invoices.map((invoice) => ({
      id: invoice.invoiceId ?? invoice.invoiceNumber,
      userName:
        (invoice.userId ? usersById.get(invoice.userId)?.name : undefined) ??
        invoice.customerEmail ??
        "User unavailable",
      invoice,
      paymentStatus: invoice.paymentId
        ? paymentResult.statuses.get(invoice.paymentId)
        : undefined,
    })),
    dataWarning: [userResult.error, paymentResult.error].filter(Boolean).join(" "),
  };
}

export default function Invoices() {
  const queryClient = useQueryClient();
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useToastFeedback(error);
  const [dataWarning, setDataWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadInvoices = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const result = await loadInvoiceRows(refresh, adminId, queryClient);
      setRows(result.rows);
      setDataWarning(result.dataWarning);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load the admin invoice list.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminId, queryClient]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const { invoice } = row;
      const status = row.paymentStatus ?? invoice.status;
      const matchesSearch =
        !term ||
        `${invoice.invoiceNumber} ${invoice.invoiceName ?? ""} ${row.userName} ${invoice.customerEmail ?? ""} ${status} ${invoice.status}`
          .toLowerCase()
          .includes(term);
      return matchesSearch && (statusFilter === "all" || status === statusFilter);
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      paid: rows.filter((row) => row.invoice.status === "successful").length,
      refunded: rows.filter((row) => row.invoice.status === "refunded").length,
      linksUnavailable: rows.filter(
        (row) => !row.invoice.hostedInvoiceUrl && !row.invoice.downloadUrl,
      ).length,
    }),
    [rows],
  );

  if (loading) return <LoadingState label="Loading invoices..." />;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <FileText size={24} />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Invoices</h1>
            <p className="mt-1 text-sm text-slate-300">
              Invoices, associated users, payment statuses, and Stripe links.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadInvoices(true)}
          disabled={refreshing}
        >
          <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh invoices"}
        </Button>
      </div>

      {error && <Button variant="secondary" onClick={() => void loadInvoices(true)}>Try loading invoices again</Button>}
      {dataWarning && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Invoice records loaded with limited linked details: {dataWarning}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["All invoices", counts.total],
          ["Paid", counts.paid],
          ["Refunded", counts.refunded],
          ["Links unavailable", counts.linksUnavailable],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-myinder-muted">{label}</p>
            <p className="mt-1 text-2xl font-extrabold text-myinder-navy">{value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="w-full sm:max-w-md">
            <Input
              search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice number or user..."
              aria-label="Search invoices"
            />
          </div>
          <label htmlFor="invoice-status-filter" className="sr-only">
            Filter by payment status
          </label>
          <select
            id="invoice-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
          >
            <option value="all">All statuses</option>
            {Object.entries(statusPresentation).map(([status, presentation]) => (
              <option key={status} value={status}>{presentation.label}</option>
            ))}
          </select>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileText size={42} className="mx-auto text-indigo-300" />
            <h2 className="mt-3 font-bold text-myinder-navy">No invoices found</h2>
            <p className="mt-1 text-sm text-myinder-muted">
              Invoices appear here when they have been recorded by the payment service.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-myinder-muted">
            No invoices match your search or status filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-blue-50/70 text-xs uppercase tracking-wide text-myinder-muted">
                <tr>
                  <th scope="col" className="px-5 py-4">Invoice number</th>
                  <th scope="col" className="px-5 py-4">User</th>
                  <th scope="col" className="px-5 py-4">Payment / invoice status</th>
                  <th scope="col" className="px-5 py-4">Invoice links</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status = row.invoice.status;
                  const presentation = statusPresentation[status];
                  const paymentPresentation =
                    statusPresentation[row.paymentStatus ?? status];
                  const PaymentIcon = paymentPresentation.Icon;
                  return (
                    <tr key={row.id} className="border-t border-blue-50">
                      <td className="px-5 py-4">
                        <p className="font-mono font-semibold text-myinder-navy">
                          {row.invoice.invoiceNumber || "Invoice number pending"}
                        </p>
                        {row.invoice.invoiceName && (
                          <p className="mt-1 text-xs text-myinder-muted">{row.invoice.invoiceName}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-myinder-navy">{row.userName}</p>
                        {row.invoice.customerEmail && row.userName !== row.invoice.customerEmail && (
                          <p className="mt-1 text-xs text-myinder-muted">{row.invoice.customerEmail}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-myinder-muted">Payment:</span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${paymentPresentation.className}`}>
                            <PaymentIcon size={14} />
                            {row.paymentStatus
                              ? paymentPresentation.label
                              : `${presentation.label} (invoice)`}
                          </span>
                        </div>
                        {row.paymentStatus && row.paymentStatus !== status && (
                          <p className="mt-1 text-xs text-myinder-muted">
                            Invoice: {presentation.label}
                          </p>
                        )}
                        {row.invoice.amountMinor !== undefined && row.invoice.currency && (
                          <p className="mt-1 text-xs text-myinder-muted">
                            {new Intl.NumberFormat(undefined, {
                              style: "currency",
                              currency: row.invoice.currency,
                            }).format(row.invoice.amountMinor / 100)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.invoice.hostedInvoiceUrl && (
                            <a
                              href={row.invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 px-2.5 py-1.5 text-xs font-semibold text-myinder-blue hover:bg-blue-50"
                            >
                              <ExternalLink size={14} /> View
                            </a>
                          )}
                          {row.invoice.downloadUrl && (
                            <a
                              href={row.invoice.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 px-2.5 py-1.5 text-xs font-semibold text-myinder-blue hover:bg-blue-50"
                            >
                              <Download size={14} /> PDF
                            </a>
                          )}
                          {!row.invoice.hostedInvoiceUrl && !row.invoice.downloadUrl && (
                            <span className="text-xs text-myinder-muted">Links unavailable</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {refreshing && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-4 text-sm text-myinder-muted">
            <RefreshCw size={16} className="animate-spin" />
            Updating invoices...
          </div>
        )}
      </section>
    </main>
  );
}
