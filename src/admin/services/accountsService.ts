import { adminApiFetch } from "./adminApiFetch";

export interface ManagedAccount {
  id: string;
  adminId: string;
  university: string;
  handle: string;
  email: string;
  emailPassword: string;
  accountPassword: string;
  emailRecoveryNo: string;
  accountRecoveryNo: string;
  followers: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountFields = Omit<
  ManagedAccount,
  "id" | "adminId" | "createdAt" | "updatedAt"
>;

export interface AccountPage {
  items: ManagedAccount[];
  page: number;
  totalPages: number;
}

export interface ImportAccountsResult {
  imported: number;
  skipped: number;
  adminId: string;
  items: ManagedAccount[];
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

function accountRecord(value: unknown): ApiRecord {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return asRecord(root.account ?? data.account ?? root.data ?? value);
}

function readText(record: ApiRecord, key: string, required = false): string {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (required) throw new Error(`The accounts API returned an invalid ${key}.`);
  return "";
}

function mapAccount(value: unknown): ManagedAccount {
  const record = accountRecord(value);
  const id = record.id ?? record.account_id ?? record.uuid;
  const adminId = record.admin_id ?? record.adminId;
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    (typeof adminId !== "string" && typeof adminId !== "number")
  ) {
    throw new Error("The accounts API returned a record without a valid ID or owner.");
  }

  return {
    id: String(id),
    adminId: String(adminId),
    university: readText(record, "university", true),
    handle: readText(record, "handle", true),
    email: readText(record, "email"),
    emailPassword: readText(record, "emailPassword"),
    accountPassword: readText(record, "accountPassword"),
    emailRecoveryNo: readText(record, "emailRecoveryNo"),
    accountRecoveryNo: readText(record, "accountRecoveryNo"),
    followers: readText(record, "followers"),
    createdAt: readText(record, "created_at") || readText(record, "createdAt"),
    updatedAt: readText(record, "updated_at") || readText(record, "updatedAt"),
  };
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
  return `Account request failed (HTTP ${status}).`;
}

function getEndpoint(): string {
  if (!import.meta.env.DEV && !API_ORIGIN) {
    throw new Error("Missing VITE_ADMIN_API_ORIGIN for account requests.");
  }
  if (!import.meta.env.DEV && new URL(API_ORIGIN).protocol !== "https:") {
    throw new Error("The accounts API must use HTTPS.");
  }
  return `${import.meta.env.DEV ? "" : API_ORIGIN}/api/admin/accounts`;
}

async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: object,
): Promise<unknown> {
  const response = await adminApiFetch(`${getEndpoint()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "Cache-Control": "no-store",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

function getPageInfo(payload: unknown, fallbackPage: number) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const pagination = asRecord(root.pagination ?? data.pagination ?? root.meta);
  const pageValue = root.page ?? root.current_page ?? data.page ??
    data.current_page ?? pagination.page ?? pagination.current_page;
  const totalPagesValue = root.total_pages ?? root.totalPages ??
    data.total_pages ?? data.totalPages ?? pagination.total_pages ??
    pagination.totalPages ?? pagination.pages;
  return {
    page: typeof pageValue === "number" && Number.isInteger(pageValue) && pageValue > 0
      ? pageValue
      : fallbackPage,
    totalPages: typeof totalPagesValue === "number" &&
      Number.isInteger(totalPagesValue) && totalPagesValue > 0
      ? totalPagesValue
      : fallbackPage,
  };
}

function getRows(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const rows = root.items ?? root.accounts ?? root.results ??
    data.items ?? data.accounts ?? data.results ?? root.data;
  if (!Array.isArray(rows)) {
    throw new Error("The accounts API response did not contain an accounts list.");
  }
  return rows;
}

export async function getAccounts(options: {
  page: number;
  limit: number;
  search: string;
  adminId?: string;
}): Promise<AccountPage> {
  const query = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
  });
  if (options.search.trim()) query.set("search", options.search.trim());
  if (options.adminId) query.set("admin_id", options.adminId);

  const payload = await request(`?${query.toString()}`, "GET");
  const info = getPageInfo(payload, options.page);
  return {
    items: getRows(payload).map(mapAccount),
    page: info.page,
    totalPages: info.totalPages,
  };
}

export async function getAccount(id: string): Promise<ManagedAccount> {
  return mapAccount(await request(`/${encodeURIComponent(id)}`, "GET"));
}

export async function createAccount(
  fields: AccountFields,
  adminId?: string,
): Promise<void> {
  await request("", "POST", { ...fields, ...(adminId ? { admin_id: adminId } : {}) });
}

export async function updateAccount(
  id: string,
  fields: Partial<AccountFields>,
  adminId?: string,
): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, "PATCH", {
    ...fields,
    ...(adminId ? { admin_id: adminId } : {}),
  });
}

export async function deleteAccount(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, "DELETE");
}

export async function importAccounts(options: {
  rows: unknown[];
  adminId?: string;
  skipExisting: boolean;
}): Promise<ImportAccountsResult> {
  if (options.rows.length < 1 || options.rows.length > 1000) {
    throw new Error("Import must contain between 1 and 1000 account rows.");
  }
  const payload = await request("/import", "POST", {
    rows: options.rows,
    skip_existing: options.skipExisting,
    ...(options.adminId ? { admin_id: options.adminId } : {}),
  });
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const result = asRecord(root.result ?? data);
  const imported = result.imported;
  const skipped = result.skipped;
  const adminId = result.admin_id ?? result.adminId;
  if (
    typeof imported !== "number" ||
    typeof skipped !== "number" ||
    (typeof adminId !== "string" && typeof adminId !== "number")
  ) {
    throw new Error("The accounts import response did not contain valid counts and owner.");
  }
  const rawItems = result.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("The accounts import response did not contain imported records.");
  }
  return {
    imported,
    skipped,
    adminId: String(adminId),
    items: rawItems.map(mapAccount),
  };
}
