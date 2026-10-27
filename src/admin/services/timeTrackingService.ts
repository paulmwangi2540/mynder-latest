import { adminApiFetch } from "./adminApiFetch";

export type ShiftStatus = "active" | "paused" | "clocked_out";
export type ShiftIntervalKind = "active" | "break";

export interface ShiftInterval {
  kind: ShiftIntervalKind;
  started_at: string;
  ended_at: string | null;
}

export interface TimeShift {
  id: string;
  admin_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  last_transition_at: string;
  is_paused: boolean;
  active_seconds: number;
  break_seconds: number;
  intervals: ShiftInterval[];
  reset_at: string;
  status: ShiftStatus;
  active_hours: number;
  total_seconds: number;
}

export interface TimeHistoryPage {
  items: TimeShift[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TimeSummaryItem {
  admin_id: string;
  shift_count: number;
  active_seconds: number;
  break_seconds: number;
  active_hours: number;
}

export interface TimeSummary {
  items: TimeSummaryItem[];
  total_active_seconds: number;
}

export type ShiftAction = "clock-in" | "pause" | "resume" | "clock-out";

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");
const BASE_URL = `${import.meta.env.DEV ? "" : API_ORIGIN}/api/admin/time-tracking`;
const RESET_TIMEZONE = "Africa/Nairobi";

function estimateResetAt(clockIn: string): string {
  const clockInTime = new Date(clockIn).getTime();
  if (!Number.isFinite(clockInTime)) {
    throw new Error("The time-tracking API returned an invalid clocked_in_at.");
  }

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(clockInTime);
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const localNoonUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    9,
  );
  const nextNoonUtc =
    localNoonUtc > clockInTime ? localNoonUtc : localNoonUtc + 24 * 60 * 60 * 1000;
  return new Date(nextNoonUtc).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The time-tracking API returned an invalid ${key}.`);
  }
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`The time-tracking API returned an invalid ${key}.`);
  }
  return value;
}

function mapShift(value: unknown): TimeShift {
  const record = asRecord(value);
  const status = record.status;
  if (status !== "active" && status !== "paused" && status !== "clocked_out") {
    throw new Error("The time-tracking API returned an invalid shift status.");
  }
  if (typeof record.is_paused !== "boolean" || !Array.isArray(record.intervals)) {
    throw new Error("The time-tracking API returned an invalid shift.");
  }

  const intervals = record.intervals.map((value): ShiftInterval => {
    const interval = asRecord(value);
    if (interval.kind !== "active" && interval.kind !== "break") {
      throw new Error("The time-tracking API returned an invalid interval kind.");
    }
    if (interval.ended_at !== null && typeof interval.ended_at !== "string") {
      throw new Error("The time-tracking API returned an invalid interval end time.");
    }
    return {
      kind: interval.kind,
      started_at: requiredText(interval, "started_at"),
      ended_at: interval.ended_at,
    };
  });

  const clockedOutAt = record.clocked_out_at;
  if (clockedOutAt !== null && typeof clockedOutAt !== "string") {
    throw new Error("The time-tracking API returned an invalid clocked_out_at.");
  }
  const clockedInAt = requiredText(record, "clocked_in_at");
  const rawResetAt = record.reset_at ?? record.resetAt;
  let resetAt: string;
  if (rawResetAt === undefined || rawResetAt === null || rawResetAt === "") {
    resetAt = estimateResetAt(clockedInAt);
  } else if (
    typeof rawResetAt === "string" &&
    rawResetAt.trim() &&
    Number.isFinite(new Date(rawResetAt).getTime())
  ) {
    resetAt = rawResetAt;
  } else {
    throw new Error("The time-tracking API returned an invalid reset_at.");
  }

  return {
    id: requiredText(record, "id"),
    admin_id: requiredText(record, "admin_id"),
    clocked_in_at: clockedInAt,
    clocked_out_at: clockedOutAt,
    last_transition_at: requiredText(record, "last_transition_at"),
    is_paused: record.is_paused,
    active_seconds: requiredNumber(record, "active_seconds"),
    break_seconds: requiredNumber(record, "break_seconds"),
    intervals,
    reset_at: resetAt,
    status,
    active_hours: requiredNumber(record, "active_hours"),
    total_seconds: requiredNumber(record, "total_seconds"),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The time-tracking API returned an invalid JSON response.");
  }
}

function getErrorMessage(payload: unknown, status: number): string {
  const root = asRecord(payload);
  const body = asRecord(root.response);
  const message = root.message ?? body.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );
    if (messages.length) return messages.join(", ");
  }
  return `Time-tracking request failed (HTTP ${status}).`;
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!import.meta.env.DEV) {
    if (!API_ORIGIN) {
      throw new Error("Missing VITE_ADMIN_API_ORIGIN for attendance requests.");
    }
    if (new URL(API_ORIGIN).protocol !== "https:") {
      throw new Error("The time-tracking API must use HTTPS.");
    }
  }
  const response = await adminApiFetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(getErrorMessage(payload, response.status));
  return payload;
}

export async function getCurrentShift(): Promise<TimeShift | null> {
  const payload = await request("/current", { method: "GET" });
  return payload === null ? null : mapShift(payload);
}

export async function updateShift(action: ShiftAction): Promise<TimeShift> {
  return mapShift(await request(`/${action}`, { method: "POST" }));
}

export async function getTimeHistory(
  page: number,
  adminId?: string,
): Promise<TimeHistoryPage> {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (adminId) query.set("admin_id", adminId);
  const payload = asRecord(await request(`/history?${query}`, { method: "GET" }));
  if (!Array.isArray(payload.items)) {
    throw new Error("The time-tracking history response did not contain an items array.");
  }
  const pageInfo = {
    total: requiredNumber(payload, "total"),
    page: requiredNumber(payload, "page"),
    limit: requiredNumber(payload, "limit"),
    total_pages: requiredNumber(payload, "total_pages"),
  };
  return { items: payload.items.map(mapShift), ...pageInfo };
}

export async function getTimeSummary(adminId?: string): Promise<TimeSummary> {
  const query = new URLSearchParams();
  if (adminId) query.set("admin_id", adminId);
  const suffix = query.size ? `?${query}` : "";
  const payload = asRecord(await request(`/summary${suffix}`, { method: "GET" }));
  if (!Array.isArray(payload.items)) {
    throw new Error("The time-tracking summary response did not contain an items array.");
  }

  return {
    total_active_seconds: requiredNumber(payload, "total_active_seconds"),
    items: payload.items.map((value): TimeSummaryItem => {
      const item = asRecord(value);
      return {
        admin_id: requiredText(item, "admin_id"),
        shift_count: requiredNumber(item, "shift_count"),
        active_seconds: requiredNumber(item, "active_seconds"),
        break_seconds: requiredNumber(item, "break_seconds"),
        active_hours: requiredNumber(item, "active_hours"),
      };
    }),
  };
}
