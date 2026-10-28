import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useToastFeedback from "../../hooks/useToastFeedback";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  setNotificationRead,
  type AdminNotification,
} from "../services/notificationsService";
import { useAdminAuthStore } from "../stores/adminAuthStore";

const NOTIFICATIONS_POLL_MS = 20_000;

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Date unavailable";
}

export default function AdminNotifications() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [ringing, setRinging] = useState(false);
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const deviceNotificationsEnabledRef = useRef(deviceNotificationsEnabled);
  const seenNotificationIds = useRef(new Set<string>());
  const notificationsInitialized = useRef(false);
  const ringTimeout = useRef<number | null>(null);
  const notificationKey = ["admin-notifications", adminId ?? ""] as const;

  const firstPageQuery = useQuery({
    queryKey: [...notificationKey, "feed", 1],
    queryFn: () => getNotifications(1),
    enabled: Boolean(adminId),
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const selectedPageQuery = useQuery({
    queryKey: [...notificationKey, "feed", notificationPage],
    queryFn: () => getNotifications(notificationPage),
    enabled: Boolean(adminId) && notificationsOpen && notificationPage > 1,
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const unreadCountQuery = useQuery({
    queryKey: [...notificationKey, "unread-count"],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(adminId),
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const feedQuery = notificationPage === 1 ? firstPageQuery : selectedPageQuery;
  const feedItems = (feedQuery.data?.items ?? []).filter(
    (notification) => notification.recipient_id === adminId,
  );
  const previewItems = (firstPageQuery.data?.items ?? []).filter(
    (notification) => notification.recipient_id === adminId,
  );
  const readMutation = useMutation({
    mutationFn: ({ notification, unread }: { notification: AdminNotification; unread: boolean }) =>
      setNotificationRead(notification.id, !unread),
    onSuccess: async (_updated, variables) => {
      await queryClient.invalidateQueries({ queryKey: notificationKey });
      const { toast } = await import("sonner");
      toast.success(variables.unread ? "Notification marked as read." : "Notification marked as unread.");
    },
  });
  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: notificationKey });
      const { toast } = await import("sonner");
      toast.success(updated ? `Marked ${updated} notifications as read.` : "There are no unread notifications.");
    },
  });
  useToastFeedback(
    firstPageQuery.error?.message ||
      unreadCountQuery.error?.message ||
      selectedPageQuery.error?.message ||
      readMutation.error?.message ||
      readAllMutation.error?.message,
  );

  async function enableDeviceNotifications() {
    try {
      if (!("Notification" in window)) {
        throw new Error("This browser does not support device notifications.");
      }
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Device notifications are blocked for this site. Allow them in your browser settings."
            : "Device notification permission was not granted.",
        );
      }
      setDeviceNotificationsEnabled(true);
    } catch (cause: unknown) {
      const { toast } = await import("sonner");
      toast.error(cause instanceof Error ? cause.message : "Unable to enable device notifications.");
    }
  }

  function toggleDeviceNotifications() {
    if (!deviceNotificationsEnabled) {
      void enableDeviceNotifications();
      return;
    }
    setDeviceNotificationsEnabled(false);
  }

  useEffect(() => {
    deviceNotificationsEnabledRef.current = deviceNotificationsEnabled;
  }, [deviceNotificationsEnabled]);

  useEffect(() => {
    seenNotificationIds.current.clear();
    notificationsInitialized.current = false;
    setNotificationPage(1);
    setNotificationsOpen(false);
  }, [adminId]);

  useEffect(() => {
    const notifications = firstPageQuery.data?.items.filter(
      (notification) => notification.recipient_id === adminId,
    );
    if (!firstPageQuery.isSuccess || !notifications) return;
    if (!notificationsInitialized.current) {
      notificationsInitialized.current = true;
      seenNotificationIds.current = new Set(notifications.map(({ id }) => id));
      return;
    }
    const newNotifications = notifications.filter(
      ({ id }) => !seenNotificationIds.current.has(id),
    );
    seenNotificationIds.current = new Set(notifications.map(({ id }) => id));
    if (!newNotifications.length) return;
    setNotificationPage(1);
    setRinging(true);
    if (ringTimeout.current !== null) window.clearTimeout(ringTimeout.current);
    ringTimeout.current = window.setTimeout(() => {
      setRinging(false);
      ringTimeout.current = null;
    }, 2_000);
    if (deviceNotificationsEnabledRef.current && "Notification" in window && Notification.permission === "granted") {
      newNotifications.forEach((notification) => {
        try {
          const systemNotification = new Notification(notification.title, {
            body: notification.message,
            icon: "/mylnder-logo.png",
            tag: `mylnder-admin-${notification.id}`,
          });
          window.setTimeout(() => systemNotification.close(), 10_000);
        } catch (cause: unknown) {
          void import("sonner").then(({ toast }) => {
            toast.error(cause instanceof Error
              ? cause.message
              : "Unable to show a device notification.");
          });
        }
      });
    }
  }, [adminId, firstPageQuery.data, firstPageQuery.isSuccess]);

  useEffect(() => () => {
    if (ringTimeout.current !== null) window.clearTimeout(ringTimeout.current);
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [previewOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [notificationsOpen]);

  return (
    <div className="relative order-1 ml-auto sm:order-4 sm:ml-auto xl:order-none">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPreviewOpen((open) => !open)}
        aria-label={`Notifications${unreadCountQuery.data ? `, ${unreadCountQuery.data} unread` : ""}`}
        aria-expanded={previewOpen || notificationsOpen}
        aria-controls="admin-notifications-preview"
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/40 text-white transition hover:bg-slate-800 ${ringing ? "animate-bounce" : ""}`}
      >
        <Bell size={20} />
        <span aria-live="polite" className="sr-only">{ringing ? "New notification received" : ""}</span>
        {Boolean(unreadCountQuery.data) && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {(unreadCountQuery.data ?? 0) > 99 ? "99+" : unreadCountQuery.data}
          </span>
        )}
      </button>
      {previewOpen && (
        <section
          id="admin-notifications-preview"
          aria-label="Recent notifications"
          className="absolute right-0 top-full z-50 mt-3 w-[min(90vw,360px)] rounded-2xl border border-slate-600 bg-[#0c1b2b] p-4 text-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Notifications</h2>
              <p className="mt-1 text-xs text-slate-400">{unreadCountQuery.data ?? 0} unread</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close notifications preview"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            >
              <X size={17} />
            </button>
          </div>
          {firstPageQuery.isPending ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading notifications…</p>
          ) : firstPageQuery.isError ? (
            <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
              Could not load notifications. Try again shortly.
            </div>
          ) : previewItems.length ? (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {previewItems.slice(0, 3).map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-xl border p-3 ${notification.read_at ? "border-slate-700 bg-slate-900/40" : "border-sky-800/70 bg-sky-950/30"}`}
                >
                  <h3 className="text-sm font-bold text-white">{notification.title}</h3>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">
                    {notification.message}
                  </p>
                  <time className="mt-2 block text-[11px] text-slate-500" dateTime={notification.created_at}>
                    {formatNotificationDate(notification.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-300">
              You’re all caught up.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setNotificationPage(1);
              setPreviewOpen(false);
              setNotificationsOpen(true);
            }}
            className="mt-3 w-full rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-slate-800"
          >
            View all notifications
          </button>
        </section>
      )}
      {notificationsOpen && createPortal(
        <div
          className="admin-theme safe-area-padding fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNotificationsOpen(false);
          }}
        >
          <section
            id="admin-notifications"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-notifications-title"
            className="flex max-h-[min(90vh,90dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-[#0c1b2b] p-4 text-white shadow-2xl sm:p-6"
          >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="admin-notifications-title" className="text-lg font-bold sm:text-xl">Notifications</h2>
              <p className="mt-1 text-xs text-slate-400">{unreadCountQuery.data ?? 0} unread</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setNotificationsOpen(false)}
              aria-label="Close notifications"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            >
              <X size={17} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleDeviceNotifications}
              aria-label={deviceNotificationsEnabled ? "Disable device notifications" : "Enable device notifications"}
              title={deviceNotificationsEnabled ? "Disable device notifications" : "Enable device notifications"}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Bell size={14} />
              {deviceNotificationsEnabled ? "Device alerts on" : "Enable device alerts"}
            </button>
            <button
              type="button"
              onClick={() => readAllMutation.mutate()}
              disabled={!unreadCountQuery.data || readAllMutation.isPending}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {readAllMutation.isPending ? "Updating…" : "Mark all read"}
            </button>
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {feedQuery.isPending ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading notifications…</p>
            ) : feedQuery.isError ? (
              <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
                Could not load notifications. Close and reopen the feed to retry.
              </div>
            ) : feedItems.length ? (
              <ul className="space-y-2">
                {feedItems.map((notification) => (
                  <li
                    key={notification.id}
                    className={`rounded-xl border p-3 ${notification.read_at ? "border-slate-700 bg-slate-900/40" : "border-sky-800/70 bg-sky-950/30"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-white">{notification.title}</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{notification.message}</p>
                        <time className="mt-2 block text-[11px] text-slate-500" dateTime={notification.created_at}>
                          {formatNotificationDate(notification.created_at)}
                        </time>
                      </div>
                      <button
                        type="button"
                        onClick={() => readMutation.mutate({
                          notification,
                          unread: Boolean(notification.read_at),
                        })}
                        disabled={readMutation.isPending}
                        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-sky-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {notification.read_at ? "Mark unread" : "Mark read"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-8 text-center text-sm text-slate-300">
                You’re all caught up.
              </p>
            )}
          </div>
          {feedQuery.data && feedQuery.data.total_pages > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-3">
              <button
                type="button"
                onClick={() => setNotificationPage((page) => Math.max(1, page - 1))}
                disabled={notificationPage <= 1}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Newer
              </button>
              <span className="text-xs text-slate-400">Page {notificationPage} of {feedQuery.data.total_pages}</span>
              <button
                type="button"
                onClick={() => setNotificationPage((page) => Math.min(feedQuery.data?.total_pages ?? page, page + 1))}
                disabled={notificationPage >= feedQuery.data.total_pages}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Older
              </button>
            </div>
          )}
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
