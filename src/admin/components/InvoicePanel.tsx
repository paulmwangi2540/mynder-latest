import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, FileText, LoaderCircle } from "lucide-react";
import { getInvoice, type UserInvoice } from "../services/invoicesService";
import useToastFeedback from "../../hooks/useToastFeedback";

export default function InvoicePanel({
  invoiceNumber,
  loadDetails = true,
}: {
  invoiceNumber?: string;
  loadDetails?: boolean;
}) {
  const [invoice, setInvoice] = useState<UserInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useToastFeedback(error);
  const statusLabels: Record<UserInvoice["status"], string> = {
    successful: "Successful",
    pending: "Pending",
    failed: "Failed",
    canceled: "Canceled",
    refunded: "Refunded",
    unknown: "Unknown",
  };

  useEffect(() => {
    if (!invoiceNumber || !loadDetails) {
      setInvoice(null);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setInvoice(null);
    setError("");
    setLoading(true);
    getInvoice(invoiceNumber)
      .then((result) => {
        if (active) setInvoice(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load invoice.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invoiceNumber, loadDetails]);

  return (
    <section className="mb-6 rounded-lg border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-myinder-navy">
            <FileText size={18} className="text-myinder-blue" />
            Payment invoice
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-myinder-muted">Invoice number</span>
            <span className="rounded bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-myinder-navy">
              {invoiceNumber || "Not available"}
            </span>
          </div>
        </div>
        {invoice && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            invoice.status === "successful"
              ? "bg-green-50 text-green-700"
              : invoice.status === "pending"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-700"
          }`}>
            {invoice.status === "successful" ? (
              <CheckCircle2 size={15} />
            ) : invoice.status === "pending" ? (
              <Clock3 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            {statusLabels[invoice.status]}
          </span>
        )}
        {loading && <LoaderCircle size={17} aria-label="Loading invoice" className="animate-spin text-myinder-blue" />}
      </div>

      {invoice && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-blue-50 pt-3 text-sm">
          {invoice.amountMinor !== undefined && invoice.currency && (
            <p className="text-myinder-muted">
              Amount: <span className="font-semibold text-myinder-navy">
                {new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency })
                  .format(invoice.amountMinor / 100)}
              </span>
            </p>
          )}
          {invoice.paidAt && (
            <p className="text-myinder-muted">
              Paid: <span className="font-medium text-myinder-navy">
                {new Date(invoice.paidAt).toLocaleString()}
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
