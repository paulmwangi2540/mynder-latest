import { adminApiFetch } from "./adminApiFetch";

export type CommissionPaymentStatus = "pending" | "paid";

export interface Commission {
  id: string;
  admin_id: string;
  start_date: string;
  end_date: string;
  week_sales: string;
  weekday_commission: string;
  holiday_commission: string;
  sunday_commission: string;
  commission_total: string;
  payment_status: CommissionPaymentStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkCommissionResult {
  total_admins: number;
  created: number;
  updated: number;
  skipped_paid: number;
  commissions: Commission[];
}

type ApiRecord = Record<string, unknown>;

export class CommissionApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CommissionApiError";
  }
}

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function requiredText(record: ApiRecord, key: string): string {
  const value = record[key];
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error(`The commissions API returned an invalid ${key}.`);
  }
  return String(value);
}

function moneyText(record: ApiRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !/^\d+(?:\.\d{2})$/.test(value)) {
    throw new Error(`The commissions API returned an invalid ${key}.`);
  }
  return value;
}

function mapCommission(value: unknown): Commission {
  const record = asRecord(value);
  const paymentStatus = record.payment_status;
  if (paymentStatus !== "pending" && paymentStatus !== "paid") {
    throw new Error("The commissions API returned an invalid payment_status.");
  }
  if (record.paid_at !== null && typeof record.paid_at !== "string") {
    throw new Error("The commissions API returned an invalid paid_at.");
  }

  return {
    id: requiredText(record, "id"),
    admin_id: requiredText(record, "admin_id"),
    start_date: requiredText(record, "start_date"),
    end_date: requiredText(record, "end_date"),
    week_sales: moneyText(record, "week_sales"),
    weekday_commission: moneyText(record, "weekday_commission"),
    holiday_commission: moneyText(record, "holiday_commission"),
    sunday_commission: moneyText(record, "sunday_commission"),
    commission_total: moneyText(record, "commission_total"),
    payment_status: paymentStatus,
    paid_at: record.paid_at,
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

function endpoint(): string {
  if (!import.meta.env.DEV && !API_ORIGIN) {
    throw new Error("Missing VITE_ADMIN_API_ORIGIN for commission requests.");
  }
  if (!import.meta.env.DEV && new URL(API_ORIGIN).protocol !== "https:") {
    throw new Error("The commissions API must use HTTPS.");
  }
  return `${import.meta.env.DEV ? "" : API_ORIGIN}/api/commissions`;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function errorMessage(payload: unknown, status: number): string {
  const root = asRecord(payload);
  const nested = asRecord(root.response);
  const message = root.message ?? nested.message ?? root.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === "string");
    if (messages.length) return messages.join(", ");
  }
  return `Commission request failed (HTTP ${status}).`;
}

async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: object,
): Promise<unknown> {
  const response = await adminApiFetch(`${endpoint()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new CommissionApiError(errorMessage(payload, response.status), response.status);
  return payload;
}

export async function getCommissions(): Promise<Commission[]> {
  const payload = await request("", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("The commissions API response did not contain a commissions array.");
  }
  return payload.map(mapCommission);
}

export async function generateBulkCommissions(input: {
  start_date: string;
  end_date: string;
}): Promise<BulkCommissionResult> {
  const result = asRecord(await request("/bulk", "POST", input));
  const totalAdmins = result.total_admins;
  const created = result.created;
  const updated = result.updated;
  const skippedPaid = result.skipped_paid;
  if (
    typeof totalAdmins !== "number" || !Number.isInteger(totalAdmins) || totalAdmins < 0 ||
    typeof created !== "number" || !Number.isInteger(created) || created < 0 ||
    typeof updated !== "number" || !Number.isInteger(updated) || updated < 0 ||
    typeof skippedPaid !== "number" || !Number.isInteger(skippedPaid) || skippedPaid < 0 ||
    !Array.isArray(result.commissions)
  ) {
    throw new Error("The commissions API returned an invalid bulk generation summary.");
  }
  const commissions = result.commissions.map(mapCommission);
  if (
    created + updated + skippedPaid !== totalAdmins ||
    commissions.length !== created + updated
  ) {
    throw new Error("The commissions API returned inconsistent bulk generation counts.");
  }
  return {
    total_admins: totalAdmins,
    created,
    updated,
    skipped_paid: skippedPaid,
    commissions,
  };
}

export async function updateCommissionPaymentStatus(
  id: string,
  payment_status: CommissionPaymentStatus,
): Promise<Commission> {
  return mapCommission(await request(
    `/${encodeURIComponent(id)}`,
    "PATCH",
    { payment_status },
  ));
}

export async function deleteCommission(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, "DELETE");
}
