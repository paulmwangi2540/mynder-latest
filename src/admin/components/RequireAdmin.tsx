import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

export default function RequireAdmin() {
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const expiresAt = useAdminAuthStore((state) => state.expiresAt);
  const refreshAdmin = useAdminAuthStore((state) => state.refreshAdmin);
  const signOut = useAdminAuthStore((state) => state.signOut);
  const location = useLocation();
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [checkedKey, setCheckedKey] = useState("");
  const [refreshError, setRefreshError] = useState("");
  useToastFeedback(refreshError);
  const checkKey = `${accessToken ?? ""}:${location.pathname}`;
  const authenticated =
    Boolean(accessToken) && expiresAt !== null && expiresAt > Date.now();

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    setCheckingAdmin(true);
    setRefreshError("");

    void refreshAdmin()
      .then(() => {
        if (active) setCheckedKey(checkKey);
      })
      .catch((cause: unknown) => {
        if (active) {
          setRefreshError(
            cause instanceof Error
              ? cause.message
              : "Unable to refresh administrator permissions.",
          );
        }
      })
      .finally(() => {
        if (active) setCheckingAdmin(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, authenticated, checkKey, location.pathname, refreshAdmin]);

  useEffect(() => {
    if (!accessToken) return;
    const remainingMs = expiresAt === null ? 0 : expiresAt - Date.now();
    if (remainingMs <= 0) {
      signOut();
      return;
    }

    const timeout = window.setTimeout(signOut, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [accessToken, expiresAt, signOut]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;

    const refreshPermissions = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        await refreshAdmin();
        if (active) setRefreshError("");
      } catch (cause: unknown) {
        if (active) {
          setRefreshError(
            cause instanceof Error
              ? cause.message
              : "Unable to refresh administrator permissions.",
          );
        }
      }
    };
    const interval = window.setInterval(() => void refreshPermissions(), 60_000);
    window.addEventListener("focus", refreshPermissions);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshPermissions);
    };
  }, [authenticated, refreshAdmin]);

  if (!authenticated) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (checkingAdmin || checkedKey !== checkKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1828] text-sm text-slate-300">
        Checking administrator access...
      </main>
    );
  }

  if (refreshError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b1828] px-4 text-center">
        <button
          type="button"
          onClick={() => {
            setRefreshError("");
            setCheckingAdmin(true);
            void refreshAdmin()
              .then(() => setCheckedKey(checkKey))
              .catch((cause: unknown) => {
                setRefreshError(
                  cause instanceof Error
                    ? cause.message
                    : "Unable to refresh administrator permissions.",
                );
              })
              .finally(() => setCheckingAdmin(false));
          }}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
        >
          Try again
        </button>
      </main>
    );
  }

  return <Outlet />;
}
