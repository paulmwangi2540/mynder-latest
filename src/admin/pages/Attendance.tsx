import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarClock, Clock3, Coffee, LogIn, LogOut, RefreshCw } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import Pagination from "../components/Pagination";
import {
  getCurrentShift,
  getTimeHistory,
  getTimeSummary,
  updateShift,
  type ShiftAction,
  type ShiftInterval,
  type TimeShift,
} from "../services/timeTrackingService";
import { useAdminAuthStore } from "../stores/adminAuthStore";

const TIMEZONE = "Africa/Nairobi";
const BASE_KEY = ["admin-time-tracking"] as const;

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "In progress";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(date);
}

function formatStatus(status: TimeShift["status"]): string {
  if (status === "clocked_out") return "Clocked out";
  return status === "active" ? "Working" : "On break";
}

interface ShiftActivity {
  id: string;
  kind: ShiftInterval["kind"] | "clock-out";
  label: string;
  startedAt: string;
  endedAt: string | null;
}

function getShiftActivities(shift: TimeShift): ShiftActivity[] {
  const activities = shift.intervals.map((interval, index): ShiftActivity => ({
    id: `${interval.kind}-${interval.started_at}-${index}`,
    kind: interval.kind,
    label: interval.kind === "break"
      ? "Break started"
      : index === 0
        ? "Clocked in · Work started"
        : "Break ended · Work resumed",
    startedAt: interval.started_at,
    endedAt: interval.ended_at ??
      (index === shift.intervals.length - 1 ? shift.clocked_out_at : null),
  }));

  if (!activities.length) {
    activities.push({
      id: `clock-in-${shift.clocked_in_at}`,
      kind: "active",
      label: "Clocked in · Work started",
      startedAt: shift.clocked_in_at,
      endedAt: shift.clocked_out_at,
    });
  }

  if (shift.clocked_out_at) {
    const resetAt = new Date(shift.reset_at).getTime();
    const clockedOutAt = new Date(shift.clocked_out_at).getTime();
    const endedByReset = Number.isFinite(resetAt) && clockedOutAt === resetAt;
    activities.push({
      id: `clock-out-${shift.clocked_out_at}`,
      kind: "clock-out",
      label: endedByReset
        ? "Shift ended · 12:00 PM Nairobi reset"
        : shift.is_paused
          ? "Clocked out during break"
          : "Clocked out",
      startedAt: shift.clocked_out_at,
      endedAt: null,
    });
  }

  return activities;
}

function getElapsedSeconds(
  shift: TimeShift,
  dataUpdatedAt: number,
  now: number,
): { active: number; breaks: number } {
  const resetAt = new Date(shift.reset_at).getTime();
  const elapsedUntil = Number.isFinite(resetAt) ? Math.min(now, resetAt) : now;
  const elapsed = Math.max(0, Math.floor((elapsedUntil - dataUpdatedAt) / 1000));
  return {
    active: shift.active_seconds + (shift.status === "active" ? elapsed : 0),
    breaks: shift.break_seconds + (shift.status === "paused" ? elapsed : 0),
  };
}

function ShiftActivityTimeline({ shift }: { shift: TimeShift }) {
  const activities = getShiftActivities(shift);

  return (
    <section className="mt-6 border-t border-slate-700 pt-4" aria-label="Shift activity timeline">
      <h3 className="text-sm font-bold text-white">Activity timeline</h3>
      <ol className="mt-3 space-y-3">
        {activities.map((activity, index) => (
          <li key={activity.id} className="relative flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-emerald-300">
              {activity.kind === "break" ? <Coffee size={15} />
                : activity.kind === "clock-out" ? <LogOut size={15} />
                  : index === 0 ? <LogIn size={15} />
                    : <Activity size={15} />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-200">{activity.label}</p>
                <time className="text-xs tabular-nums text-slate-400">
                  {formatDateTime(activity.startedAt)}
                </time>
              </div>
              {activity.kind !== "clock-out" && (
                <p className="mt-1 text-xs text-slate-400">
                  {activity.endedAt
                    ? `${activity.kind === "active" ? "Work" : "Break"} ended ${formatDateTime(activity.endedAt)}`
                    : `${activity.kind === "active" ? "Work" : "Break"} in progress`}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function QueryError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
      {message}
    </p>
  );
}

export default function Attendance() {
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [historyPage, setHistoryPage] = useState(1);
  const [action, setAction] = useState<ShiftAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const currentQuery = useQuery({
    queryKey: [...BASE_KEY, adminId ?? "", "current"],
    queryFn: getCurrentShift,
    enabled: Boolean(adminId),
    staleTime: 0,
    refetchInterval: (query) => query.state.data ? 5_000 : 30_000,
    refetchOnWindowFocus: true,
  });
  const historyQuery = useQuery({
    queryKey: [...BASE_KEY, adminId ?? "", "history", historyPage],
    queryFn: () => getTimeHistory(historyPage, adminId),
    enabled: Boolean(adminId),
    staleTime: 30_000,
  });
  const summaryQuery = useQuery({
    queryKey: [...BASE_KEY, adminId ?? "", "summary"],
    queryFn: () => getTimeSummary(adminId),
    enabled: Boolean(adminId),
    staleTime: 30_000,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const shift = currentQuery.data ?? null;
  const elapsed = useMemo(
    () => shift ? getElapsedSeconds(shift, currentQuery.dataUpdatedAt, now) : null,
    [shift, currentQuery.dataUpdatedAt, now],
  );
  const resetAt = shift ? new Date(shift.reset_at).getTime() : Number.NaN;
  const resetReached = Boolean(shift && Number.isFinite(resetAt) && now >= resetAt);
  const totalPages = Math.max(1, historyQuery.data?.total_pages ?? 1);

  async function runAction(nextAction: ShiftAction) {
    if (action) return;
    setAction(nextAction);
    setActionError("");
    setNotice("");
    try {
      const updatedShift = await updateShift(nextAction);
      queryClient.setQueryData(
        [...BASE_KEY, adminId ?? "", "current"],
        nextAction === "clock-out" ? null : updatedShift,
      );
      setNotice(
        nextAction === "clock-in" ? "You’re clocked in. Have a productive shift."
          : nextAction === "pause" ? "Break started. Your work time is paused."
            : nextAction === "resume" ? "Break ended. Your work timer is running."
              : "You’re clocked out. Today’s hours have been saved.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...BASE_KEY, adminId ?? "", "history"] }),
        queryClient.invalidateQueries({ queryKey: [...BASE_KEY, adminId ?? "", "summary"] }),
      ]);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update your attendance.");
      void currentQuery.refetch();
    } finally {
      setAction(null);
    }
  }

  if (!adminId) return <QueryError message="Your admin session is unavailable. Sign in again to use attendance tracking." />;
  if (currentQuery.isPending && historyQuery.isPending && summaryQuery.isPending) {
    return <LoadingState label="Loading attendance..." />;
  }

  const actionButton = (nextAction: ShiftAction, label: string, Icon: typeof LogIn) => (
    <Button
      type="button"
      onClick={() => void runAction(nextAction)}
      disabled={Boolean(action) || resetReached}
      className="min-w-36"
    >
      {action === nextAction ? <RefreshCw size={17} className="animate-spin" /> : <Icon size={17} />}
      {action === nextAction ? "Updating..." : label}
    </Button>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Staff tools</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Attendance</h1>
          <p className="mt-2 text-sm text-slate-300">
            Track your work time and breaks. The workday resets at 12:00 PM Nairobi time.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void Promise.all([currentQuery.refetch(), historyQuery.refetch(), summaryQuery.refetch()]);
          }}
          disabled={currentQuery.isFetching || historyQuery.isFetching || summaryQuery.isFetching}
        >
          <RefreshCw size={17} className={currentQuery.isFetching || historyQuery.isFetching || summaryQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>

      {actionError && <QueryError message={actionError} />}
      {currentQuery.isError && <QueryError message={currentQuery.error.message} />}
      {notice && <p role="status" className="rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <article className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-300">Today’s shift</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {shift ? formatStatus(shift.status) : "Not clocked in"}
              </p>
            </div>
            {shift && (
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                shift.status === "active" ? "bg-emerald-950 text-emerald-300"
                  : shift.status === "paused" ? "bg-amber-950 text-amber-300"
                    : "bg-slate-800 text-slate-300"
              }`}>
                {formatStatus(shift.status)}
              </span>
            )}
          </div>

          {shift ? (
            <>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Activity size={15} /> Active work</p>
                  <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-emerald-300">{formatDuration(elapsed?.active ?? shift.active_seconds)}</p>
                  <p className="mt-1 text-xs text-slate-400">Breaks excluded</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Coffee size={15} /> Break time</p>
                  <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-amber-300">{formatDuration(elapsed?.breaks ?? shift.break_seconds)}</p>
                  <p className="mt-1 text-xs text-slate-400">Does not count toward active hours</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                <span>Clocked in {formatDateTime(shift.clocked_in_at)}</span>
                <span className="flex items-center gap-1.5"><CalendarClock size={15} /> Closes {formatDateTime(shift.reset_at)}</span>
              </div>
              {resetReached && (
                <p role="status" className="mt-4 rounded-lg bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
                  Noon reset reached. Checking for the server-saved shift before enabling a new day.
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                {shift.status === "active" && actionButton("pause", "Take a break", Coffee)}
                {shift.status === "paused" && actionButton("resume", "Resume work", Activity)}
                {actionButton("clock-out", "Clock out", LogOut)}
              </div>
              <ShiftActivityTimeline shift={shift} />
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-600 px-4 py-6 text-center">
              <Clock3 size={28} className="mx-auto text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">Clock in to start recording today’s active hours.</p>
              <div className="mt-4 flex justify-center">{actionButton("clock-in", "Clock in", LogIn)}</div>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-slate-300">All-time summary</p>
          {summaryQuery.isError ? (
            <p role="alert" className="mt-4 text-sm text-red-300">{summaryQuery.error.message}</p>
          ) : (
            <>
              <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-white">
                {formatDuration(summaryQuery.data?.total_active_seconds ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-400">Total active work time</p>
              <div className="mt-5 space-y-3 border-t border-slate-700 pt-4">
                {(summaryQuery.data?.items ?? []).map((item) => (
                  <div key={item.admin_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-300">
                      {item.admin_id === adminId ? "Your recorded shifts" : item.admin_id}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-emerald-300">
                      {item.active_hours.toFixed(2)} hrs · {item.shift_count} shifts
                    </span>
                  </div>
                ))}
                {!summaryQuery.data?.items.length && (
                  <p className="text-sm text-slate-400">No recorded shifts yet.</p>
                )}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Shift history</h2>
            <p className="mt-1 text-xs text-slate-400">Work and break intervals are recorded by the server.</p>
          </div>
          {historyQuery.data && <span className="text-sm text-slate-400">{historyQuery.data.total} shifts</span>}
        </div>
        {historyQuery.isError ? (
          <p role="alert" className="p-5 text-sm text-red-300">{historyQuery.error.message}</p>
        ) : historyQuery.isPending ? (
          <LoadingState label="Loading shift history..." />
        ) : historyQuery.data?.items.length ? (
          <div className="divide-y divide-slate-700">
            {historyQuery.data.items.map((record) => (
              <article key={record.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{formatDateTime(record.clocked_in_at)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {record.clocked_out_at
                        ? `Clocked out ${formatDateTime(record.clocked_out_at)}`
                        : `Open shift · scheduled reset ${formatDateTime(record.reset_at)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-emerald-300">{record.active_hours.toFixed(2)} active hrs</span>
                    <span className="text-amber-300">{formatDuration(record.break_seconds)} break</span>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{formatStatus(record.status)}</span>
                  </div>
                </div>
                <ShiftActivityTimeline shift={record} />
              </article>
            ))}
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-slate-400">Your shift history will appear here after you clock out.</p>
        )}
        {historyQuery.data && historyQuery.data.total_pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 px-5 py-4">
            <p className="text-xs text-slate-400">Page {historyPage} of {totalPages}</p>
            <Pagination
              page={historyPage}
              totalPages={totalPages}
              onChange={(page) => setHistoryPage(page)}
            />
          </div>
        )}
      </section>
    </main>
  );
}
