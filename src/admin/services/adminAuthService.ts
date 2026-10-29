export interface AdminSchool {
  id: string;
  name: string;
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolIds: string[];
  schools: AdminSchool[];
  lastLoginAt?: string;
  createdAt?: string;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: number;
  admin: AdminAccount;
}

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  schoolIds: string[];
}

export interface AdminListPage {
  admins: AdminAccount[];
  page: number;
  totalPages: number;
}

export interface AdminPasswordResetResult {
  adminId: string;
  message: string;
  revokedSessions: number;
}

type ApiRecord = Record<string, unknown>;

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminApiError";
  }
}

const ADMIN_API_BASE_URL = import.meta.env.DEV
  ? ""
  : import.meta.env.VITE_ADMIN_API_ORIGIN?.replace(/\/+$/, "") ?? "";

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function getErrorMessage(payload: unknown): string | undefined {
  const body = asRecord(payload);
  const response = asRecord(body.response);
  const rawMessage = body.message ?? response.message ?? body.error;

  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage.trim();
  }

  if (Array.isArray(rawMessage)) {
    const messages = rawMessage.filter(
      (message): message is string => typeof message === "string",
    );
    if (messages.length) return messages.join(", ");
  }

  return undefined;
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

function getAdmin(value: unknown): AdminAccount {
  const body = asRecord(value);
  const data = asRecord(body.data);
  const admin = asRecord(body.admin ?? data.admin ?? body.data ?? value);
  const id = admin.id ?? admin.admin_id ?? admin.uuid;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    typeof admin.name !== "string" ||
    typeof admin.email !== "string"
  ) {
    throw new Error("The admin API returned an invalid admin account.");
  }

  const rawSchools = Array.isArray(admin.schools) ? admin.schools : [];
  const schools = rawSchools.map((school) => {
    const record = asRecord(school);
    const schoolId = record.id ?? record.school_id ?? record.uuid;
    const name = record.name ?? record.school_name;
    if (
      (typeof schoolId !== "string" && typeof schoolId !== "number") ||
      typeof name !== "string"
    ) {
      throw new Error("The admin API returned an invalid school assignment.");
    }
    return { id: String(schoolId), name };
  });
  const rawSchoolIds = Array.isArray(admin.school_ids)
    ? admin.school_ids
    : Array.isArray(admin.schoolIds)
      ? admin.schoolIds
      : schools.map((school) => school.id);
  const schoolIds = rawSchoolIds
    .filter((schoolId): schoolId is string | number =>
      typeof schoolId === "string" || typeof schoolId === "number",
    )
    .map(String);
  const role =
    typeof admin.role === "string"
      ? admin.role
      : typeof admin.role_name === "string"
        ? admin.role_name
        : "admin";
  const lastLoginAt = admin.last_login_at ?? admin.lastLoginAt;
  const createdAt = admin.created_at ?? admin.createdAt;

  return {
    id: String(id),
    name: admin.name,
    email: admin.email,
    role,
    schoolIds,
    schools,
    ...(typeof lastLoginAt === "string" ? { lastLoginAt } : {}),
    ...(typeof createdAt === "string" ? { createdAt } : {}),
  };
}

function extractRows(payload: unknown, keys: string[]): unknown[] | undefined {
  if (Array.isArray(payload)) return payload;

  const body = asRecord(payload);
  const data = asRecord(body.data);
  for (const key of keys) {
    if (Array.isArray(body[key])) return body[key] as unknown[];
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }

  for (const candidate of [body.data, body.result, body.response]) {
    if (Array.isArray(candidate)) return candidate;
    const nested = asRecord(candidate);
    for (const key of keys) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }

  return undefined;
}

async function requestAdminApi(
  endpoint: string,
  body: object | undefined,
  accessToken?: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "POST",
): Promise<unknown> {
  const headers = new Headers({ Accept: "application/json" });
  if (body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${ADMIN_API_BASE_URL}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    const fallback =
      response.status === 409
        ? "An admin with this email already exists."
        : `Admin request failed (HTTP ${response.status}).`;
    throw new AdminApiError(getErrorMessage(payload) ?? fallback, response.status);
  }

  return payload;
}

function getPageMetadata(payload: unknown, fallbackPage: number) {
  const body = asRecord(payload);
  const data = asRecord(body.data);
  const pagination = asRecord(body.pagination ?? data.pagination ?? body.meta);
  const pageValue =
    body.page ??
    body.current_page ??
    data.page ??
    data.current_page ??
    pagination.page ??
    pagination.current_page;
  const totalPagesValue =
    body.total_pages ??
    body.totalPages ??
    data.total_pages ??
    data.totalPages ??
    pagination.total_pages ??
    pagination.totalPages ??
    pagination.pages;

  return {
    page:
      typeof pageValue === "number" && Number.isInteger(pageValue) && pageValue > 0
        ? pageValue
        : fallbackPage,
    totalPages:
      typeof totalPagesValue === "number" &&
      Number.isInteger(totalPagesValue) &&
      totalPagesValue > 0
        ? totalPagesValue
        : fallbackPage,
  };
}

export async function loginAdmin(
  email: string,
  password: string,
): Promise<AdminSession> {
  const payload = await requestAdminApi("/api/admin/login", {
    email: email.trim(),
    password,
  });
  const body = asRecord(payload);
  const accessToken = body.access_token;
  const expiresIn = body.expires_in;

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("The admin login response did not contain a valid session.");
  }

  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    admin: getAdmin(payload),
  };
}

export async function getCurrentAdmin(
  accessToken: string,
): Promise<AdminAccount> {
  return getAdmin(
    await requestAdminApi("/api/admin/me", undefined, accessToken, "GET"),
  );
}

export async function logoutAdmin(accessToken: string): Promise<void> {
  await requestAdminApi("/api/admin/logout", undefined, accessToken);
}

export async function updateAdminDetails(
  id: string,
  details: { name: string; email: string },
  accessToken: string,
): Promise<void> {
  await requestAdminApi(
    `/api/admin/${encodeURIComponent(id)}`,
    { name: details.name.trim(), email: details.email.trim() },
    accessToken,
    "PATCH",
  );
}

export async function getSchools(accessToken: string): Promise<AdminSchool[]> {
  const payload = await requestAdminApi(
    "/api/admin/schools",
    undefined,
    accessToken,
    "GET",
  );
  const rows = extractRows(payload, ["schools", "items", "results"]);
  if (!rows) {
    throw new Error("The Schools API response did not contain a schools list.");
  }

  return rows.map((value) => {
    const record = asRecord(value);
    const id = record.id ?? record.school_id ?? record.uuid;
    const name = record.name ?? record.school_name;
    if (
      (typeof id !== "string" && typeof id !== "number") ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      throw new Error("The Schools API returned a record without a valid ID or name.");
    }
    return { id: String(id), name: name.trim() };
  });
}

export async function createAdmin(
  admin: CreateAdminInput,
  accessToken: string,
): Promise<AdminAccount> {
  const payload = await requestAdminApi(
    "/api/admin",
    {
      name: admin.name.trim(),
      email: admin.email.trim(),
      password: admin.password,
      school_ids: admin.schoolIds,
    },
    accessToken,
  );
  return getAdmin(payload);
}

export async function createSuperAdmin(
  admin: Omit<CreateAdminInput, "schoolIds">,
  accessToken: string,
): Promise<AdminAccount> {
  const payload = await requestAdminApi(
    "/api/admin/super-admins",
    {
      name: admin.name.trim(),
      email: admin.email.trim(),
      password: admin.password,
    },
    accessToken,
  );
  const created = getAdmin(payload);
  const role = created.role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role !== "super_admin" && role !== "superadmin") {
    throw new Error("The API did not return a super-admin account.");
  }
  return created;
}

export async function createMiniAdmin(
  admin: Omit<CreateAdminInput, "schoolIds">,
  accessToken: string,
): Promise<AdminAccount> {
  const payload = await requestAdminApi(
    "/api/admin/mini-admins",
    {
      name: admin.name.trim(),
      email: admin.email.trim(),
      password: admin.password,
    },
    accessToken,
  );
  const created = getAdmin(payload);
  const role = created.role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role !== "mini_admin" && role !== "miniadmin") {
    throw new Error("The API did not return a mini-admin account.");
  }
  return created;
}

export async function getAdmins(
  accessToken: string,
  page: number,
  search: string,
): Promise<AdminListPage> {
  const query = new URLSearchParams({
    page: String(page),
    limit: "100",
  });
  if (search.trim()) query.set("search", search.trim());

  const payload = await requestAdminApi(
    `/api/admin/admins?${query.toString()}`,
    undefined,
    accessToken,
    "GET",
  );
  const rows = extractRows(payload, ["admins", "items", "results"]);
  if (!rows) {
    throw new Error("The admin API response did not contain an admins list.");
  }
  const metadata = getPageMetadata(payload, page);

  return {
    admins: rows.map(getAdmin),
    page: metadata.page,
    totalPages: metadata.totalPages,
  };
}

export async function getAdminById(
  id: string,
  accessToken: string,
): Promise<AdminAccount> {
  const payload = await requestAdminApi(
    `/api/admin/admins/${encodeURIComponent(id)}`,
    undefined,
    accessToken,
    "GET",
  );
  return getAdmin(payload);
}

export async function updateAdminSchools(
  id: string,
  schoolIds: string[],
  accessToken: string,
): Promise<AdminAccount> {
  const payload = await requestAdminApi(
    `/api/admin/admins/${encodeURIComponent(id)}/schools`,
    { school_ids: schoolIds },
    accessToken,
    "PATCH",
  );
  return getAdmin(payload);
}

export async function resetAdminPassword(
  id: string,
  password: string,
  accessToken: string,
): Promise<AdminPasswordResetResult> {
  const payload = await requestAdminApi(
    `/api/admin/admins/${encodeURIComponent(id)}/password`,
    { password },
    accessToken,
    "PATCH",
  );
  const body = asRecord(payload);
  const data = asRecord(body.data);
  const result = asRecord(body.result);
  const response = asRecord(body.response);
  const adminId = body.admin_id ?? data.admin_id ?? result.admin_id ?? response.admin_id;
  const message = body.message ?? data.message ?? result.message ?? response.message;
  const revokedSessions =
    body.revoked_sessions ??
    data.revoked_sessions ??
    result.revoked_sessions ??
    response.revoked_sessions;

  if (
    (typeof adminId !== "string" && typeof adminId !== "number") ||
    typeof message !== "string" ||
    typeof revokedSessions !== "number" ||
    !Number.isInteger(revokedSessions) ||
    revokedSessions < 0
  ) {
    throw new Error("The password reset API returned an invalid response.");
  }

  return {
    adminId: String(adminId),
    message,
    revokedSessions,
  };
}
