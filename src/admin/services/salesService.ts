import { adminApiFetch } from "./adminApiFetch";

export const PAYMENT_METHODS = [
  "Zelle",
  "Cash App",
  "Venmo",
  "PayPal",
  "Apple Pay",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Sale {
  id: string;
  admin_id: string;
  university_id: string;
  payment_method: string;
  amount: number;
  sale_date: string;
  time: string;
  created_at: string;
}

export interface CreateSaleInput {
  university_id: string;
  payment_method: PaymentMethod;
  amount: number;
  sale_date: string;
}

type ApiRecord = Record<string, unknown>;

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
    throw new Error(`The sales API returned an invalid ${key}.`);
  }
  return String(value);
}

function mapSale(value: unknown): Sale {
  const record = asRecord(value);
  const amountValue = record.amount;
  const amount = typeof amountValue === "number"
    ? amountValue
    : typeof amountValue === "string"
      ? Number(amountValue)
      : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("The sales API returned an invalid sale amount.");
  }
  return {
    id: requiredText(record, "id"),
    admin_id: requiredText(record, "admin_id"),
    university_id: requiredText(record, "university_id"),
    payment_method: requiredText(record, "payment_method"),
    amount,
    sale_date: requiredText(record, "sale_date"),
    time: requiredText(record, "time"),
    created_at: requiredText(record, "created_at"),
  };
}

function endpoint(): string {
  if (!import.meta.env.DEV && !API_ORIGIN) {
    throw new Error("Missing VITE_ADMIN_API_ORIGIN for sales requests.");
  }
  if (!import.meta.env.DEV && new URL(API_ORIGIN).protocol !== "https:") {
    throw new Error("The sales API must use HTTPS.");
  }
  return `${import.meta.env.DEV ? "" : API_ORIGIN}/api/sales`;
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

function readError(payload: unknown, status: number): string {
  const root = asRecord(payload);
  const nested = asRecord(root.response);
  const message = root.message ?? nested.message ?? root.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const messages = message.filter((value): value is string => typeof value === "string");
    if (messages.length) return messages.join(", ");
  }
  return `Sales request failed (HTTP ${status}).`;
}

async function request(
  method: "GET" | "POST",
  body?: CreateSaleInput,
): Promise<unknown> {
  const response = await adminApiFetch(endpoint(), {
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
  if (!response.ok) throw new Error(readError(payload, response.status));
  return payload;
}

export async function getSales(): Promise<Sale[]> {
  const payload = await request("GET");
  if (!Array.isArray(payload)) {
    throw new Error("The sales API response did not contain a sales array.");
  }
  return payload.map(mapSale);
}

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  return mapSale(await request("POST", input));
}
