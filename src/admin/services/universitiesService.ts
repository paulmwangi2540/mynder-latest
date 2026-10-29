
import { adminApiFetch } from "./adminApiFetch";

export interface UniversityRecord {
  id: string;
  name: string;
  slug?: string;
  profileName?: string;
  customColor?: string;
  template?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UniversityInput {
  name: string;
  profileName: string;
  customColor: string;
  slug: string;
}

const USERS_API_URL =
  import.meta.env.VITE_ADMIN_USERS_API_URL ?? "";

const UNIVERSITIES_API_URL =
  import.meta.env.VITE_ADMIN_UNIVERSITIES_API_URL ||
  USERS_API_URL.replace(/\/users\/?$/, "/Schools");

const UNIVERSITIES_CACHE_TTL_MS = 60_000;

let universitiesCache: {
  rows: UniversityRecord[];
  expiresAt: number;
} | null = null;

let universitiesRequest: Promise<UniversityRecord[]> | null = null;

type ApiRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function getErrorMessage(payload: unknown): string | undefined {
  const body = asRecord(payload);
  const message =
    body.message ?? asRecord(body.response).message;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === "string"
    );

    if (messages.length) {
      return messages.join(", ");
    }
  }

  return undefined;
}

async function readPayload(
  response: Response
): Promise<unknown> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapUniversity(value: unknown): UniversityRecord {
  const record = asRecord(value);

  const id =
    record.id ??
    record.university_id ??
    record.school_id ??
    record.uuid;

  const name =
    record.name ??
    record.university_name ??
    record.school_name;

  const profileName =
    record.profile_name ?? record.profileName;

  const customColor =
    record.custom_color ?? record.customColor;
  const slug = record.slug;
  const template = record.template;
  const createdAt = record.created_at ?? record.createdAt;
  const updatedAt = record.updated_at ?? record.updatedAt;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    typeof name !== "string" ||
    !name.trim()
  ) {
    throw new Error(
      "The Schools API returned a record without a valid ID or name."
    );
  }

  return {
    id: String(id),
    name: name.trim(),
    ...(typeof slug === "string" && slug.trim()
      ? { slug: slug.trim() }
      : {}),
    ...(typeof profileName === "string" && profileName.trim()
      ? { profileName: profileName.trim() }
      : {}),
    ...(typeof customColor === "string"
      ? { customColor }
      : {}),
    ...(typeof template === "string" && template.trim()
      ? { template: template.trim() }
      : {}),
    ...(typeof createdAt === "string" && createdAt.trim()
      ? { createdAt: createdAt.trim() }
      : {}),
    ...(typeof updatedAt === "string" && updatedAt.trim()
      ? { updatedAt: updatedAt.trim() }
      : {}),
  };
}

function extractUniversityRows(
  payload: unknown
): unknown[] | undefined {
  if (Array.isArray(payload)) {
    return payload;
  }

  const body = asRecord(payload);

  // Check common collection property names.
  const keys = [
    "universities",
    "schools",
    "items",
    "results",
  ];

  for (const key of keys) {
    if (Array.isArray(body[key])) {
      return body[key] as unknown[];
    }
  }

  // Check common response wrappers, including nested data.
  for (const key of ["data", "result", "response"]) {
    const nested = body[key];

    if (Array.isArray(nested)) {
      return nested;
    }

    const nestedRecord = asRecord(nested);

    for (const collectionKey of keys) {
      if (Array.isArray(nestedRecord[collectionKey])) {
        return nestedRecord[collectionKey] as unknown[];
      }
    }

    // Support another level of nesting, such as data.data.
    const deeper = asRecord(nestedRecord.data);

    for (const collectionKey of keys) {
      if (Array.isArray(deeper[collectionKey])) {
        return deeper[collectionKey] as unknown[];
      }
    }
  }

  return undefined;
}

export async function getUniversities(): Promise<
  UniversityRecord[]
> {
  if (
    universitiesCache &&
    universitiesCache.expiresAt > Date.now()
  ) {
    return universitiesCache.rows;
  }

  if (universitiesRequest) {
    return universitiesRequest;
  }

  const request = loadUniversities();
  universitiesRequest = request;

  try {
    const rows = await request;

    universitiesCache = {
      rows,
      expiresAt: Date.now() + UNIVERSITIES_CACHE_TTL_MS,
    };

    return rows;
  } finally {
    if (universitiesRequest === request) {
      universitiesRequest = null;
    }
  }
}

async function loadUniversities(): Promise<
  UniversityRecord[]
> {
  if (!UNIVERSITIES_API_URL) {
    throw new Error(
      "The universities API URL is not configured."
    );
  }

  const response = await adminApiFetch(
    UNIVERSITIES_API_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const payload = await readPayload(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Unable to load universities (HTTP ${response.status}).`
    );
  }

  const rows = extractUniversityRows(payload);

  if (!rows) {
    if (typeof payload === "string") {
      throw new Error(
        "The Schools API returned non-JSON content. Check the API URL and Vercel environment variables."
      );
    }

    throw new Error(
      "The Schools API returned JSON, but no supported universities or schools array was found."
    );
  }

  return rows.map(mapUniversity);
}

async function saveUniversity(
  endpoint: string,
  method: "POST" | "PATCH",
  university: UniversityInput,
): Promise<void> {
  if (!UNIVERSITIES_API_URL) {
    throw new Error(
      "The universities API URL is not configured."
    );
  }

  const response = await adminApiFetch(
    endpoint,
    {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: university.name.trim(),
        profile_name: university.profileName.trim(),
        custom_color: university.customColor.trim(),
        slug: university.slug.trim(),
      }),
    }
  );

  const payload = await readPayload(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Unable to save the university (HTTP ${response.status}).`
    );
  }

  universitiesCache = null;
}

export function createUniversity(university: UniversityInput): Promise<void> {
  return saveUniversity(UNIVERSITIES_API_URL, "POST", university);
}

export function updateUniversity(
  id: string,
  university: UniversityInput,
): Promise<void> {
  const endpoint = `${UNIVERSITIES_API_URL.replace(/\/+$/, "")}/${encodeURIComponent(id)}`;
  return saveUniversity(endpoint, "PATCH", university);
}