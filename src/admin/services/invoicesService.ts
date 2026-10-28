
import { adminApiFetch } from "./adminApiFetch";

export interface UserInvoice {
  invoiceNumber: string;
  invoiceId?: string;
  invoiceName?: string;
  userId?: string;
  paymentId?: string;
  paymentMethod?: string;
  customerEmail?: string;
  hostedInvoiceUrl?: string;
  downloadUrl?: string;
  status:
    | "successful"
    | "pending"
    | "failed"
    | "canceled"
    | "refunded"
    | "unknown";
  amountMinor?: number;
  currency?: string;
  paidAt?: string;
}

type ApiRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiRecord {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function mapStatus(value: unknown): UserInvoice["status"] {
  const status = String(value ?? "").toLowerCase();
  if (
    ["paid", "succeeded", "successful", "success", "completed"].includes(status)
  ) {
    return "successful";
  }
  if (
    [
      "pending",
      "processing",
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
      "requires_capture",
    ].includes(status)
  ) {
    return "pending";
  }
  if (["canceled", "cancelled", "void"].includes(status)) return "canceled";
  if (["refunded", "partially_refunded"].includes(status)) return "refunded";
  if (["failed", "declined", "payment_failed"].includes(status)) return "failed";
  return "unknown";
}

function mapInvoice(
  value: unknown,
  fallbackInvoiceNumber = "",
): UserInvoice {
  const record = asRecord(value);
  const data = asRecord(record.data ?? record.result);
  const invoice = asRecord(record.invoice ?? data.invoice ?? data);
  const payment = asRecord(record.payment ?? invoice.payment ?? data.payment);

  const rawStatus = String(
    invoice.status ??
      invoice.payment_status ??
      payment.status ??
      payment.payment_status ??
      record.status ??
      record.payment_status ??
      data.status ??
      data.payment_status ??
      "",
  ).toLowerCase();

  const status = mapStatus(rawStatus);

  const rawAmount =
    invoice.amount_minor ??
    invoice.amount_paid ??
    invoice.amount ??
    payment.amount_minor ??
    payment.amount ??
    record.amount_minor ??
    data.amount_minor;

  const amountMinor =
    typeof rawAmount === "number" ||
    (typeof rawAmount === "string" &&
      rawAmount.trim() !== "")
      ? Number(rawAmount)
      : undefined;

  const rawCurrency =
    invoice.currency ??
    payment.currency ??
    record.currency ??
    data.currency;

  const currency =
    typeof rawCurrency === "string" &&
    /^[a-zA-Z]{3}$/.test(rawCurrency)
      ? rawCurrency.toUpperCase()
      : undefined;

  const rawPaidAt =
    invoice.paid_at ??
    payment.paid_at ??
    record.paid_at ??
    data.paid_at;
  const rawInvoiceNumber =
    invoice.invoice_number ??
    invoice.invoiceNumber ??
    invoice.number ??
    record.invoice_number ??
    record.invoiceNumber ??
    data.invoice_number ??
    data.invoiceNumber ??
    data.number;
  const rawTextField = (...values: unknown[]): string | undefined => {
    const value = values.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    );
    return typeof value === "string" ? value.trim() : undefined;
  };
  const paymentMethodDetails = asRecord(
    invoice.payment_method_details ??
      payment.payment_method_details ??
      record.payment_method_details ??
      data.payment_method_details,
  );
  const rawPaymentMethod =
    paymentMethodDetails.type ??
    invoice.payment_method_type ??
    payment.payment_method_type ??
    record.payment_method_type ??
    data.payment_method_type ??
    invoice.method ??
    payment.method ??
    record.method ??
    data.method ??
    invoice.payment_method ??
    payment.payment_method ??
    record.payment_method ??
    data.payment_method;
  const paymentMethodValue =
    typeof rawPaymentMethod === "object" && rawPaymentMethod !== null
      ? asRecord(rawPaymentMethod).type ?? asRecord(rawPaymentMethod).name
      : rawPaymentMethod;
  const paymentMethod = rawTextField(paymentMethodValue);

  return {
    invoiceNumber:
      typeof rawInvoiceNumber === "string" &&
      rawInvoiceNumber.trim()
        ? rawInvoiceNumber.trim()
        : fallbackInvoiceNumber,
    status,
    ...(rawTextField(invoice.id, record.id, data.id)
      ? { invoiceId: rawTextField(invoice.id, record.id, data.id) }
      : {}),
    ...(rawTextField(invoice.invoice_name, record.invoice_name, data.invoice_name)
      ? { invoiceName: rawTextField(invoice.invoice_name, record.invoice_name, data.invoice_name) }
      : {}),
    ...(rawTextField(invoice.user_id, record.user_id, data.user_id)
      ? { userId: rawTextField(invoice.user_id, record.user_id, data.user_id) }
      : {}),
    ...(rawTextField(invoice.payment_id, record.payment_id, data.payment_id)
      ? { paymentId: rawTextField(invoice.payment_id, record.payment_id, data.payment_id) }
      : {}),
    ...(paymentMethod && !paymentMethod.startsWith("pm_")
      ? { paymentMethod }
      : {}),
    ...(rawTextField(invoice.customer_email, record.customer_email, data.customer_email)
      ? { customerEmail: rawTextField(invoice.customer_email, record.customer_email, data.customer_email) }
      : {}),
    ...(rawTextField(invoice.hosted_invoice_url, record.hosted_invoice_url, data.hosted_invoice_url)
      ? { hostedInvoiceUrl: rawTextField(invoice.hosted_invoice_url, record.hosted_invoice_url, data.hosted_invoice_url) }
      : {}),
    ...(rawTextField(
      invoice.download_url,
      invoice.invoice_pdf,
      record.download_url,
      record.invoice_pdf,
      data.download_url,
      data.invoice_pdf,
    )
      ? {
          downloadUrl: rawTextField(
            invoice.download_url,
            invoice.invoice_pdf,
            record.download_url,
            record.invoice_pdf,
            data.download_url,
            data.invoice_pdf,
          ),
        }
      : {}),
    ...(amountMinor !== undefined &&
    Number.isFinite(amountMinor)
      ? { amountMinor }
      : {}),
    ...(currency ? { currency } : {}),
    ...(typeof rawPaidAt === "string" && rawPaidAt
      ? { paidAt: rawPaidAt }
      : {}),
  };
}

function getInvoicesEndpoint(): string {
  const origin = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");

  const configuredPath = String(
    import.meta.env.VITE_INVOICES_API_URL ?? "/api/admin/invoices",
  ).trim();

  try {
    const baseUrl = origin ? new URL(origin) : undefined;

    if (!import.meta.env.DEV && !baseUrl) {
      throw new Error(
        "Missing VITE_ADMIN_API_ORIGIN. Set it in your frontend .env file.",
      );
    }
    if (!import.meta.env.DEV && baseUrl?.protocol !== "https:") {
      throw new Error("The backend API must use HTTPS.");
    }

    const endpoint = new URL(configuredPath, `${origin || window.location.origin}/`);
    if (baseUrl && endpoint.origin !== baseUrl.origin) {
      throw new Error(
        "The invoices API URL must use the configured backend origin.",
      );
    }

    const path = endpoint.pathname.replace(/\/+$/, "");
    return import.meta.env.DEV
      ? path
      : `${endpoint.origin}${path}`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Invalid invoices API URL configuration.");
  }
}

async function readResponse(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function getErrorMessage(
  payload: unknown,
  status: number,
): string {
  const root = asRecord(payload);
  const body = asRecord(root.response);
  const message = root.message ?? body.message;
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string")
  ) {
    return message.join(", ");
  }

  return typeof message === "string" && message.trim()
    ? message
    : `Unable to load invoices (HTTP ${status}).`;
}

const INVOICE_LIST_PAGE_SIZE = 100;

async function readPagedItems(
  endpoint: string,
  resource: string,
): Promise<ApiRecord[]> {
  const items: ApiRecord[] = [];
  let page = 1;
  let totalPages: number | undefined;

  do {
    const response = await adminApiFetch(
      `${endpoint}?page=${page}&limit=${INVOICE_LIST_PAGE_SIZE}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    const payload = await readResponse(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, response.status));
    }

    const root = asRecord(payload);
    const data = asRecord(root.data);
    const pageItems = Array.isArray(root.items)
      ? root.items
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(payload)
          ? payload
          : null;
    if (!pageItems) {
      throw new Error(`The ${resource} API response did not contain an items array.`);
    }
    items.push(...pageItems.map(asRecord));

    const rawTotalPages = root.total_pages ?? data.total_pages;
    totalPages =
      typeof rawTotalPages === "number" &&
      Number.isInteger(rawTotalPages) &&
      rawTotalPages >= 0
        ? rawTotalPages
        : undefined;
    if (totalPages === undefined && pageItems.length < INVOICE_LIST_PAGE_SIZE) {
      break;
    }
    page += 1;
  } while (totalPages === undefined || page <= totalPages);

  return items;
}

/**
 * Fetch every invoice from the admin listing endpoint.
 */
export async function getInvoices(): Promise<UserInvoice[]> {
  const invoices = await readPagedItems(getInvoicesEndpoint(), "invoices");
  return invoices.map((invoice) => mapInvoice(invoice));
}

/**
 * Fetch admin payment states keyed by payment ID; unlike customer status
 * lookups, this route does not require per-checkout status tokens.
 */
export async function getAdminPaymentStatuses(): Promise<
  Map<string, UserInvoice["status"]>
> {
  const invoicesEndpoint = new URL(
    getInvoicesEndpoint(),
    window.location.origin,
  );
  invoicesEndpoint.pathname = invoicesEndpoint.pathname.replace(
    /\/invoices\/?$/,
    "/payments",
  );
  const endpoint = import.meta.env.DEV
    ? `${invoicesEndpoint.pathname}`
    : invoicesEndpoint.toString().replace(/\/$/, "");
  const payments = await readPagedItems(endpoint, "payments");

  return new Map(
    payments.flatMap((payment) => {
      const id = payment.id;
      if (typeof id !== "string" || !id.trim()) return [];
      return [[id, mapStatus(payment.status)] as const];
    }),
  );
}

const pendingRequests = new Map<
  string,
  Promise<UserInvoice>
>();

/**
 * Fetch one invoice by invoice number.
 */
export function getInvoice(
  invoiceNumber: string,
): Promise<UserInvoice> {
  const requestedInvoiceNumber = invoiceNumber.trim();
  const cacheIdentity = requestedInvoiceNumber;

  if (!requestedInvoiceNumber) {
    return Promise.reject(
      new Error("Invoice number is required."),
    );
  }

  const existingRequest = pendingRequests.get(
    cacheIdentity,
  );

  if (existingRequest) {
    return existingRequest;
  }

  const request = (async (): Promise<UserInvoice> => {
    const response = await adminApiFetch(
      `${getInvoicesEndpoint()}/${encodeURIComponent(
        requestedInvoiceNumber,
      )}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    const payload = await readResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(payload, response.status),
      );
    }

    const invoice = mapInvoice(
      payload,
      requestedInvoiceNumber,
    );

    return invoice;
  })();

  pendingRequests.set(cacheIdentity, request);

  void request.then(
    () => {
      if (
        pendingRequests.get(cacheIdentity) === request
      ) {
        pendingRequests.delete(cacheIdentity);
      }
    },
    () => {
      if (
        pendingRequests.get(cacheIdentity) === request
      ) {
        pendingRequests.delete(cacheIdentity);
      }
    },
  );

  return request;
}
