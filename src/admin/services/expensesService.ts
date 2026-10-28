import { adminApiFetch } from "./adminApiFetch";

export interface ManualExpense {
  id: string;
  category: string;
  expense_date: string;
  admin_id: string | null;
  amount_kes: string;
  amount_usd: string;
  exchange_rate: string | null;
  note: string | null;
  recorded_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface RentPayment {
  id: string;
  rent_period: string;
  amount_kes: string;
  amount_usd: string;
  exchange_rate: string | null;
  status: string;
  paid_at: string | null;
  paid_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryPayment {
  id: string;
  admin_id: string;
  salary_period: string;
  amount_kes: string;
  amount_usd: string;
  exchange_rate: string | null;
  status: string;
  paid_at: string | null;
  paid_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManualExpenseInput {
  category: string;
  expense_date: string;
  amount_kes: number;
  amount_usd: number;
  exchange_rate?: number;
  note?: string;
  admin_id?: string;
}

export interface RentPaymentInput {
  rent_period: string;
  amount_kes: number;
  amount_usd: number;
  exchange_rate?: number;
}

export interface SalaryPaymentInput {
  admin_id: string;
  salary_period: string;
  amount_kes: number;
  amount_usd: number;
  exchange_rate?: number;
}

type ApiRecord = Record<string, unknown>;

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");
const BASE_URL = `${import.meta.env.DEV ? "" : API_ORIGIN}/api/expenses`;

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function unwrap(value: unknown, key: string): ApiRecord {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return asRecord(root[key] ?? data[key] ?? root.data ?? value);
}

function requiredText(record: ApiRecord, key: string): string {
  const value = record[key];
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error(`The expenses API returned an invalid ${key}.`);
  }
  return String(value);
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function mapManualExpense(value: unknown): ManualExpense {
  const record = unwrap(value, "expense");
  return {
    id: requiredText(record, "id"),
    category: requiredText(record, "category"),
    expense_date: requiredText(record, "expense_date"),
    admin_id: nullableText(record.admin_id),
    amount_kes: requiredText(record, "amount_kes"),
    amount_usd: requiredText(record, "amount_usd"),
    exchange_rate: nullableText(record.exchange_rate),
    note: nullableText(record.note),
    recorded_by_id: requiredText(record, "recorded_by_id"),
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

function mapRentPayment(value: unknown): RentPayment {
  const record = unwrap(value, "rent");
  return {
    id: requiredText(record, "id"),
    rent_period: requiredText(record, "rent_period"),
    amount_kes: requiredText(record, "amount_kes"),
    amount_usd: requiredText(record, "amount_usd"),
    exchange_rate: nullableText(record.exchange_rate),
    status: requiredText(record, "status"),
    paid_at: nullableText(record.paid_at),
    paid_by_id: nullableText(record.paid_by_id),
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

function mapSalaryPayment(value: unknown): SalaryPayment {
  const record = unwrap(value, "salary");
  return {
    id: requiredText(record, "id"),
    admin_id: requiredText(record, "admin_id"),
    salary_period: requiredText(record, "salary_period"),
    amount_kes: requiredText(record, "amount_kes"),
    amount_usd: requiredText(record, "amount_usd"),
    exchange_rate: nullableText(record.exchange_rate),
    status: requiredText(record, "status"),
    paid_at: nullableText(record.paid_at),
    paid_by_id: nullableText(record.paid_by_id),
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: object,
): Promise<unknown> {
  if (!import.meta.env.DEV && !API_ORIGIN) {
    throw new Error("Missing VITE_ADMIN_API_ORIGIN for expenses requests.");
  }
  if (!import.meta.env.DEV && new URL(API_ORIGIN).protocol !== "https:") {
    throw new Error("The expenses API must use HTTPS.");
  }

  const response = await adminApiFetch(`${BASE_URL}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const root = asRecord(payload);
    const message = root.message ?? asRecord(root.response).message ?? root.error;
    if (typeof message === "string" && message.trim()) throw new Error(message.trim());
    if (Array.isArray(message)) {
      const messages = message.filter((item): item is string => typeof item === "string");
      if (messages.length) throw new Error(messages.join(", "));
    }
    throw new Error(`Expenses request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export async function getManualExpenses(): Promise<ManualExpense[]> {
  const payload = await request("/manual", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("The manual expenses API response did not contain an array.");
  }
  return payload.map(mapManualExpense);
}

export async function createManualExpense(input: ManualExpenseInput): Promise<ManualExpense> {
  return mapManualExpense(await request("/manual", "POST", input));
}

export async function updateManualExpense(
  id: string,
  input: Partial<ManualExpenseInput>,
): Promise<ManualExpense> {
  return mapManualExpense(await request(`/manual/${encodeURIComponent(id)}`, "PATCH", input));
}

export async function deleteManualExpense(id: string): Promise<void> {
  await request(`/manual/${encodeURIComponent(id)}`, "DELETE");
}

export async function getRentPayments(): Promise<RentPayment[]> {
  const payload = await request("/rent", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("The rent payments API response did not contain an array.");
  }
  return payload.map(mapRentPayment);
}

export async function createRentPayment(input: RentPaymentInput): Promise<RentPayment> {
  return mapRentPayment(await request("/rent", "POST", input));
}

export async function updateRentPayment(
  id: string,
  input: Partial<RentPaymentInput>,
): Promise<RentPayment> {
  return mapRentPayment(await request(`/rent/${encodeURIComponent(id)}`, "PATCH", input));
}

export async function deleteRentPayment(id: string): Promise<void> {
  await request(`/rent/${encodeURIComponent(id)}`, "DELETE");
}

export async function getSalaryPayments(): Promise<SalaryPayment[]> {
  const payload = await request("/salary", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("The salary payments API response did not contain an array.");
  }
  return payload.map(mapSalaryPayment);
}

export async function createSalaryPayment(input: SalaryPaymentInput): Promise<SalaryPayment> {
  return mapSalaryPayment(await request("/salary", "POST", input));
}

export async function updateSalaryPayment(
  id: string,
  input: Partial<SalaryPaymentInput>,
): Promise<SalaryPayment> {
  return mapSalaryPayment(await request(`/salary/${encodeURIComponent(id)}`, "PATCH", input));
}

export async function deleteSalaryPayment(id: string): Promise<void> {
  await request(`/salary/${encodeURIComponent(id)}`, "DELETE");
}
