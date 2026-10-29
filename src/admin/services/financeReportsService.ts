import { adminApiFetch } from "./adminApiFetch";

export interface FinanceReport {
  id: string;
  report_period: string;
  start_date: string;
  end_date: string;
  gross_sales: string;
  payment_deductions: string;
  sales_after_fees: string;
  manual_expenses: string;
  rent_expenses: string;
  salary_expenses: string;
  total_expenses: string;
  total_commissions: string;
  total_costs: string;
  total_profit: string;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

type ApiRecord = Record<string, unknown>;

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ApiRecord
    : {};
}

function requiredText(record: ApiRecord, key: string): string {
  const value = record[key];
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error(`The finance reports API returned an invalid ${key}.`);
  }
  return String(value);
}

function moneyText(record: ApiRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !/^-?\d+\.\d{2}$/.test(value)) {
    throw new Error(`The finance reports API returned an invalid ${key}.`);
  }
  return value;
}

function mapFinanceReport(value: unknown): FinanceReport {
  const record = asRecord(value);
  const reportPeriod = requiredText(record, "report_period");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportPeriod)) {
    throw new Error("The finance reports API returned an invalid report_period.");
  }
  return {
    id: requiredText(record, "id"),
    report_period: reportPeriod,
    start_date: requiredText(record, "start_date"),
    end_date: requiredText(record, "end_date"),
    gross_sales: moneyText(record, "gross_sales"),
    payment_deductions: moneyText(record, "payment_deductions"),
    sales_after_fees: moneyText(record, "sales_after_fees"),
    manual_expenses: moneyText(record, "manual_expenses"),
    rent_expenses: moneyText(record, "rent_expenses"),
    salary_expenses: moneyText(record, "salary_expenses"),
    total_expenses: moneyText(record, "total_expenses"),
    total_commissions: moneyText(record, "total_commissions"),
    total_costs: moneyText(record, "total_costs"),
    total_profit: moneyText(record, "total_profit"),
    last_calculated_at: requiredText(record, "last_calculated_at"),
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

function endpoint(): string {
  if (!import.meta.env.DEV && !API_ORIGIN) {
    throw new Error("Missing VITE_ADMIN_API_ORIGIN for finance reports.");
  }
  if (!import.meta.env.DEV && new URL(API_ORIGIN).protocol !== "https:") {
    throw new Error("The finance reports API must use HTTPS.");
  }
  return `${import.meta.env.DEV ? "" : API_ORIGIN}/api/finance-reports`;
}

async function request(
  path: string,
  method: "GET" | "POST" | "DELETE",
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
    const nested = asRecord(root.response);
    const message = root.message ?? nested.message ?? root.error;
    if (typeof message === "string" && message.trim()) throw new Error(message.trim());
    if (Array.isArray(message)) {
      const messages = message.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
      if (messages.length) throw new Error(messages.join(", "));
    }
    throw new Error(`Finance report request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export async function getFinanceReports(): Promise<FinanceReport[]> {
  const payload = await request("", "GET");
  if (!Array.isArray(payload)) {
    throw new Error("The finance reports API response did not contain a reports array.");
  }
  return payload.map(mapFinanceReport);
}

export async function getFinanceReport(id: string): Promise<FinanceReport> {
  return mapFinanceReport(await request(`/${encodeURIComponent(id)}`, "GET"));
}

export async function createFinanceReport(reportPeriod: string): Promise<FinanceReport> {
  return mapFinanceReport(await request("", "POST", { report_period: reportPeriod }));
}

export async function refreshFinanceReport(id: string): Promise<FinanceReport> {
  return mapFinanceReport(await request(`/${encodeURIComponent(id)}/refresh`, "POST"));
}

export async function deleteFinanceReport(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, "DELETE");
}
