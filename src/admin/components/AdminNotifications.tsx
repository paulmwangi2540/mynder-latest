import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [ringing, setRinging] = useState(false);
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const queryClient = useQueryClient();
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
    if (!notificationsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [notificationsOpen]);

  return (
    <div className="relative order-1 ml-auto sm:order-none sm:ml-auto">
      <button
        type="button"
        onClick={() => setNotificationsOpen((open) => !open)}
        aria-label={`Notifications${unreadCountQuery.data ? `, ${unreadCountQuery.data} unread` : ""}`}
        aria-expanded={notificationsOpen}
        aria-controls="admin-notifications"
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
      {notificationsOpen && (
        <section
          id="admin-notifications"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-3 w-[min(90vw,360px)] rounded-2xl border border-slate-600 bg-[#0c1b2b] p-4 text-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Notifications</h2>
              <p className="mt-1 text-xs text-slate-400">{unreadCountQuery.data ?? 0} unread</p>
            </div>
            <button
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
          {feedQuery.isPending ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading notifications…</p>
          ) : feedQuery.isError ? (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
              Could not load notifications. Close and reopen the feed to retry.
            </div>
          ) : feedItems.length ? (
            <ul className="mt-3 max-h-[min(60vh,520px)] space-y-2 overflow-y-auto">
              {feedItems.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-xl border p-3 ${notification.read_at ? "border-slate-700 bg-slate-900/40" : "border-sky-800/70 bg-sky-950/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
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
            <p className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-300">
              You’re all caught up.
            </p>
          )}
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
      )}
    </div>
  );
}
