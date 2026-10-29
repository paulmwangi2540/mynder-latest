import { adminApiFetch } from "./adminApiFetch";

export interface EmailRecord {
  id: string;
  email: string;
  used: boolean;
  used_on_tiktok: boolean;
  used_on_instagram: boolean;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailRecordInput {
  email: string;
  used: boolean;
  used_on_tiktok: boolean;
  used_on_instagram: boolean;
  assigned_to?: string | null;
}

export interface EmailStaffRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface EmailRecordPage {
  items: EmailRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface EmailRecordFilters {
  search?: string;
  used?: boolean;
  used_on_tiktok?: boolean;
  used_on_instagram?: boolean;
  assigned?: boolean;
  assigned_to?: string;
  page?: number;
  limit?: number;
}

type ApiRecord = Record<string, unknown>;

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");
const BASE_URL = `${import.meta.env.DEV ? "" : API_ORIGIN}/api/admin/emails`;

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ApiRecord
    : {};
}

function requiredText(record: ApiRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The email inventory API returned an invalid ${key}.`);
  }
  return value;
}

function requiredBoolean(record: ApiRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`The email inventory API returned an invalid ${key}.`);
  }
  return value;
}

function nonNegativeInteger(record: ApiRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The email inventory API returned an invalid ${key}.`);
  }
  return value;
}

function positiveInteger(record: ApiRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`The email inventory API returned an invalid ${key}.`);
  }
  return value;
}

function mapEmailRecord(value: unknown): EmailRecord {
  const record = asRecord(value);
  const assignedTo = record.assigned_to;
  if (assignedTo !== null && typeof assignedTo !== "string") {
    throw new Error("The email inventory API returned an invalid assigned_to.");
  }
  return {
    id: requiredText(record, "id"),
    email: requiredText(record, "email"),
    used: requiredBoolean(record, "used"),
    used_on_tiktok: requiredBoolean(record, "used_on_tiktok"),
    used_on_instagram: requiredBoolean(record, "used_on_instagram"),
    assigned_to: assignedTo,
    created_at: requiredText(record, "created_at"),
    updated_at: requiredText(record, "updated_at"),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The email inventory API returned invalid JSON.");
  }
}

function getErrorMessage(payload: unknown, status: number): string {
  const root = asRecord(payload);
  const nested = asRecord(root.response);
  const message = root.message ?? nested.message ?? root.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );
    if (messages.length) return messages.join(", ");
  }
  if (status === 409) return "An email record with this address already exists.";
  return `Email inventory request failed (HTTP ${status}).`;
}

async function request(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: object): Promise<unknown> {
  if (!import.meta.env.DEV) {
    if (!API_ORIGIN) {
      throw new Error("Missing VITE_ADMIN_API_ORIGIN for email inventory requests.");
    }
    if (new URL(API_ORIGIN).protocol !== "https:") {
      throw new Error("The email inventory API must use HTTPS.");
    }
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
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(getErrorMessage(payload, response.status));
  return payload;
}

export async function getEmailRecords(filters: EmailRecordFilters = {}): Promise<EmailRecordPage> {
  return getEmailPage("", filters);
}

function mapEmailPage(value: unknown): EmailRecordPage {
  const record = asRecord(value);
  if (!Array.isArray(record.items)) {
    throw new Error("The email inventory API response did not contain an items array.");
  }
  return {
    items: record.items.map(mapEmailRecord),
    total: nonNegativeInteger(record, "total"),
    page: positiveInteger(record, "page"),
    limit: positiveInteger(record, "limit"),
    total_pages: nonNegativeInteger(record, "total_pages"),
  };
}

export async function getMyEmailRecords(filters: Omit<EmailRecordFilters, "assigned" | "assigned_to"> = {}): Promise<EmailRecordPage> {
  return getEmailPage("/my", filters);
}

export async function getEmailStaff(filters: { limit?: number; search?: string } = {}): Promise<EmailStaffRecord[]> {
  const limit = filters.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Email staff limit must be between 1 and 100.");
  }
  const allStaff: EmailStaffRecord[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.search?.trim()) query.set("search", filters.search.trim());
    const record = asRecord(await request(`/staff?${query.toString()}`, "GET"));
    if (!Array.isArray(record.items)) {
      throw new Error("The email staff API response did not contain an items array.");
    }
    allStaff.push(...record.items.map((item) => {
      const staff = asRecord(item);
      return {
        id: requiredText(staff, "id"),
        name: requiredText(staff, "name"),
        email: requiredText(staff, "email"),
        role: requiredText(staff, "role"),
      };
    }));
    totalPages = nonNegativeInteger(record, "total_pages");
    if (page === 1 && totalPages === 0) break;
  }
  return allStaff;
}

async function getEmailPage(path: string, filters: EmailRecordFilters): Promise<EmailRecordPage> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Email inventory page must be positive and limit must be between 1 and 100.");
  }
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  for (const key of ["used", "used_on_tiktok", "used_on_instagram"] as const) {
    const value = filters[key];
    if (value !== undefined) query.set(key, String(value));
  }
  if (filters.assigned !== undefined) query.set("assigned", String(filters.assigned));
  if (filters.assigned_to) query.set("assigned_to", filters.assigned_to);
  return mapEmailPage(await request(`${path}?${query.toString()}`, "GET"));
}

export async function getEmailRecord(id: string): Promise<EmailRecord> {
  return mapEmailRecord(await request(`/${encodeURIComponent(id)}`, "GET"));
}

export async function createEmailRecord(input: EmailRecordInput): Promise<EmailRecord> {
  return mapEmailRecord(await request("", "POST", {
    email: input.email.trim().toLowerCase(),
    used: input.used,
    used_on_tiktok: input.used_on_tiktok,
    used_on_instagram: input.used_on_instagram,
    assigned_to: input.assigned_to ?? null,
  }));
}

export async function updateEmailRecord(id: string, input: Partial<EmailRecordInput>): Promise<EmailRecord> {
  const body: Partial<EmailRecordInput> = { ...input };
  if (body.email !== undefined) body.email = body.email.trim().toLowerCase();
  return mapEmailRecord(await request(`/${encodeURIComponent(id)}`, "PATCH", body));
}

export async function assignEmailRecord(id: string, assignedTo: string | null): Promise<EmailRecord> {
  return mapEmailRecord(await request(`/${encodeURIComponent(id)}/assignment`, "PATCH", {
    assigned_to: assignedTo,
  }));
}

export async function deleteEmailRecord(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, "DELETE");
}
