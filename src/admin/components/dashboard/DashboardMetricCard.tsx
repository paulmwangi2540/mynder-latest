import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import ColorfulIcon from "../ColorfulIcon";

type Tone = "blue" | "orange" | "purple" | "green";

const cardColors: Record<Tone, string> = {
  blue: "border-blue-200 bg-sky-100/70",
  orange: "border-orange-200 bg-orange-50/90",
  purple: "border-indigo-100 bg-blue-50",
  green: "border-emerald-200 bg-emerald-50/90",
};

const cardTones: Record<Tone, string> = {
  blue: "dashboard-stat-blink-blue",
  orange: "dashboard-stat-blink-orange",
  purple: "dashboard-stat-blink-purple",
  green: "dashboard-stat-blink-green",
};

export function MiniAnalytics({
  values,
  label,
  tone,
}: {
  values: number[];
  label: string;
  tone: Tone;
}) {
  if (!values.length) return null;
  const width = 120;
  const height = 24;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - 2 - (value / max) * (height - 4);
    return `${x},${y}`;
  });
  const stroke = {
    blue: "#2563eb",
    orange: "#c2410c",
    purple: "#4f46e5",
    green: "#047857",
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="mt-1 h-4 w-full max-w-32 overflow-visible sm:mt-2 sm:h-6 sm:max-w-40"
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        pathLength={1}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dashboard-mini-analytics"
      />
    </svg>
  );
}

interface Props {
  title: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  to: string;
  tone: Tone;
  trend: number[];
  trendLabel: string;
}

export default function DashboardMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  to,
  tone,
  trend,
  trendLabel,
}: Props) {
  return (
    <Link
      to={to}
      className={`dashboard-reveal dashboard-stat-blink ${cardTones[tone]} group flex min-h-0 min-w-0 items-center justify-between gap-2 rounded-xl border p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-myinder-blue sm:min-h-36 sm:gap-3 sm:rounded-2xl sm:p-5 ${cardColors[tone]}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div>
          <p className="text-[11px] font-semibold leading-tight text-myinder-muted sm:text-sm">{title}</p>
          <p className="dashboard-metric-value mt-1 break-words text-xl font-extrabold leading-tight tabular-nums text-myinder-navy sm:mt-2 sm:text-3xl">{value}</p>
          <p className="mt-1 text-[10px] leading-tight text-myinder-muted sm:mt-2 sm:text-xs">{detail}</p>
        </div>
        <div className="flex min-h-0 items-end justify-end">
          <MiniAnalytics values={trend} label={trendLabel} tone={tone} />
        </div>
      </div>
      <ColorfulIcon Icon={Icon} tone={tone} size={19} className="h-9 w-9 shrink-0 self-start rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl" />
    </Link>
  );
}
