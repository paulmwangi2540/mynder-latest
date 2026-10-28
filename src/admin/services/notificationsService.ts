import { adminApiFetch } from "./adminApiFetch";

export interface AdminNotification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  event_key: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  items: AdminNotification[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const API_ORIGIN = String(import.meta.env.VITE_ADMIN_API_ORIGIN ?? "")
  .trim()
  .replace(/\/+$/, "");
const BASE_URL = `${import.meta.env.DEV ? "" : API_ORIGIN}/api/admin/notifications`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The notifications API returned an invalid ${key}.`);
  }
  return value;
}

function countValue(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The notifications API returned an invalid ${key}.`);
  }
  return value;
}

function mapNotification(value: unknown): AdminNotification {
  const record = asRecord(value);
  const actorId = record.actor_id;
  const readAt = record.read_at;
  if (actorId !== null && typeof actorId !== "string") {
    throw new Error("The notifications API returned an invalid actor_id.");
  }
  if (readAt !== null && typeof readAt !== "string") {
    throw new Error("The notifications API returned an invalid read_at.");
  }
  const rawData = record.data;
  if (
    rawData !== undefined &&
    rawData !== null &&
    (typeof rawData !== "object" || Array.isArray(rawData))
  ) {
    throw new Error("The notifications API returned invalid notification data.");
  }
  return {
    id: requiredText(record, "id"),
    recipient_id: requiredText(record, "recipient_id"),
    actor_id: actorId,
    event_key: requiredText(record, "event_key"),
    type: requiredText(record, "type"),
    title: requiredText(record, "title"),
    message: requiredText(record, "message"),
    data: asRecord(rawData),
    read_at: readAt,
    created_at: requiredText(record, "created_at"),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The notifications API returned invalid JSON.");
  }
}

function errorMessage(payload: unknown, status: number): string {
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
  return `Notifications request failed (HTTP ${status}).`;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!import.meta.env.DEV) {
    if (!API_ORIGIN) {
      throw new Error("Missing VITE_ADMIN_API_ORIGIN for notifications requests.");
    }
    if (new URL(API_ORIGIN).protocol !== "https:") {
      throw new Error("The notifications API must use HTTPS.");
    }
  }
  const response = await adminApiFetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

export async function getNotifications(
  page = 1,
  limit = 20,
): Promise<NotificationPage> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Notification page must be positive and limit must be between 1 and 100.");
  }
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const payload = asRecord(await request(`?${query}`, { method: "GET" }));
  if (!Array.isArray(payload.items)) {
    throw new Error("The notifications API response did not contain an items array.");
  }
  return {
    items: payload.items.map(mapNotification),
    total: countValue(payload, "total"),
    page: countValue(payload, "page"),
    limit: countValue(payload, "limit"),
    total_pages: countValue(payload, "total_pages"),
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const payload = asRecord(await request("/unread-count", { method: "GET" }));
  return countValue(payload, "unread_count");
}

export async function setNotificationRead(
  id: string,
  read: boolean,
): Promise<AdminNotification> {
  const action = read ? "read" : "unread";
  return mapNotification(await request(`/${encodeURIComponent(id)}/${action}`, {
    method: "PATCH",
  }));
}

export async function markAllNotificationsRead(): Promise<number> {
  const payload = asRecord(await request("/read-all", { method: "PATCH" }));
  return countValue(payload, "updated");
}
