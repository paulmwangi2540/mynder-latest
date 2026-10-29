import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin,
  updateAdminDetails,
  AdminApiError,
  type AdminAccount,
} from "../services/adminAuthService";
import { queryClient } from "../../app/queryClient";
import { clearPersistedImageQueries } from "../../app/imageQueryPersister";
import { userQueryKeys } from "../queries/userQueryKeys";

interface AdminAuthState {
  accessToken: string | null;
  expiresAt: number | null;
  admin: AdminAccount | null;
  signIn: (email: string, password: string) => Promise<void>;
  updateProfile: (details: { name: string; email: string }) => Promise<void>;
  refreshAdmin: () => Promise<void>;
  signOut: () => void;
}

export function isSuperAdmin(admin: AdminAccount | null): boolean {
  const role = typeof admin?.role === "string"
    ? admin.role.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  return role === "super_admin" || role === "superadmin";
}

export function isMiniAdmin(admin: AdminAccount | null): boolean {
  const role = typeof admin?.role === "string"
    ? admin.role.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  return role === "mini_admin" || role === "miniadmin";
}

export function isStaffAdmin(admin: AdminAccount | null): boolean {
  const role = typeof admin?.role === "string"
    ? admin.role.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  return role === "admin";
}

export function getAdminHomePath(admin: AdminAccount | null): string {
  if (isSuperAdmin(admin)) return "/admin/dashboard";
  if (isMiniAdmin(admin)) return "/admin/expenses";
  return "/staff/dashboard";
}

function clearAdminUserData(adminId: string) {
  queryClient.removeQueries({ queryKey: userQueryKeys.all });
  void clearPersistedImageQueries(adminId).catch((error: unknown) => {
    console.error("Unable to clear cached user images after an admin access change.", error);
  });
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      expiresAt: null,
      admin: null,
      signIn: async (email, password) => {
        const session = await loginAdmin(email, password);
        const previousAdminId = useAdminAuthStore.getState().admin?.id;
        queryClient.removeQueries({ queryKey: userQueryKeys.all });
        if (previousAdminId && previousAdminId !== session.admin.id) {
          void clearPersistedImageQueries(previousAdminId).catch((error: unknown) => {
            console.error("Unable to clear previous account image queries.", error);
          });
        }
        set({
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
          admin: session.admin,
        });
      },
      updateProfile: async (details) => {
        const { admin, accessToken } = get();
        if (!admin || !accessToken) {
          throw new Error("Your admin session has expired. Please sign in again.");
        }

        await updateAdminDetails(admin.id, details, accessToken);
        const updatedAdmin = await getCurrentAdmin(accessToken);
        if (get().accessToken !== accessToken) return;
        set({ admin: updatedAdmin });
      },
      refreshAdmin: async () => {
        const accessToken = get().accessToken;
        if (!accessToken) {
          throw new Error("Your admin session has expired. Please sign in again.");
        }

        let admin: AdminAccount;
        try {
          admin = await getCurrentAdmin(accessToken);
        } catch (cause: unknown) {
          if (cause instanceof AdminApiError && cause.status === 401) {
            get().signOut();
          }
          throw cause;
        }
        if (get().accessToken !== accessToken) return;

        const previousAdmin = get().admin;
        const accessChanged =
          previousAdmin?.id !== admin.id ||
          previousAdmin?.role !== admin.role ||
          JSON.stringify([...(previousAdmin?.schoolIds ?? [])].sort()) !==
            JSON.stringify([...admin.schoolIds].sort());
        if (accessChanged && previousAdmin) {
          clearAdminUserData(previousAdmin.id);
        }
        set({ admin });
      },
      signOut: () => {
        const { accessToken, admin, expiresAt } = get();
        if (accessToken && expiresAt !== null && expiresAt > Date.now()) {
          void logoutAdmin(accessToken).catch((error: unknown) => {
            console.error("Unable to revoke the admin session.", error);
          });
        }
        const adminId = admin?.id;
        queryClient.removeQueries({ queryKey: userQueryKeys.all });
        if (adminId) {
          void clearPersistedImageQueries(adminId).catch((error: unknown) => {
            console.error("Unable to clear persisted image queries on sign-out.", error);
          });
        }
        set({ accessToken: null, expiresAt: null, admin: null });
      },
    }),
    {
      name: "mylnder-admin-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        expiresAt: state.expiresAt,
        admin: state.admin,
      }),
    },
  ),
);
