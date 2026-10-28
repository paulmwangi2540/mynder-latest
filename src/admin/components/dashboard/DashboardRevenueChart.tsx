export type RevenuePeriod = "week" | "month" | "year";

export interface RevenuePoint {
  label: string;
  timestamp: number;
  amount: number;
}

const periods: { id: RevenuePeriod; label: string }[] = [
  { id: "week", label: "7 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
];

function getChartPath(points: RevenuePoint[], width: number, height: number, max: number): string {
  if (!points.length) return "";
  const chartPoints = points.map((point, index) => ({
    x: 54 + (index / Math.max(points.length - 1, 1)) * (width - 76),
    y: 18 + (1 - point.amount / max) * (height - 58),
  }));
  if (chartPoints.length === 1) return `M ${chartPoints[0].x} ${chartPoints[0].y}`;

  return chartPoints.reduce((path, current, index) => {
    if (index === 0) return `M ${current.x} ${current.y}`;
    const previous = chartPoints[index - 1];
    const beforePrevious = chartPoints[Math.max(0, index - 2)];
    const next = chartPoints[Math.min(chartPoints.length - 1, index + 1)];
    const control1 = {
      x: previous.x + (current.x - beforePrevious.x) / 6,
      y: previous.y + (current.y - beforePrevious.y) / 6,
    };
    const control2 = {
      x: current.x - (next.x - previous.x) / 6,
      y: current.y - (next.y - previous.y) / 6,
    };
    return `${path} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${current.x} ${current.y}`;
  }, "");
}

interface Props {
  points: RevenuePoint[];
  period: RevenuePeriod;
  onPeriodChange: (period: RevenuePeriod) => void;
  currency: string;
  currencies: string[];
  onCurrencyChange: (currency: string) => void;
  loading: boolean;
  error: boolean;
  monthLabel: string;
  year: number;
  formatMoney: (amountMinor: number, currency: string) => string;
}

export default function DashboardRevenueChart({
  points,
  period,
  onPeriodChange,
  currency,
  currencies,
  onCurrencyChange,
  loading,
  error,
  monthLabel,
  year,
  formatMoney,
}: Props) {
  const maxRevenue = Math.max(1, ...points.map((point) => point.amount));
  const chartWidth = 720;
  const chartHeight = 300;
  const chartPath = getChartPath(points, chartWidth, chartHeight, maxRevenue);
  const areaPath = chartPath
    ? `${chartPath} L ${chartWidth - 22} ${chartHeight - 40} L 54 ${chartHeight - 40} Z`
    : "";
  const periodLabel = period === "week" ? "the last 7 days" : period === "month" ? "this month" : "this year";

  return (
    <article className="dashboard-reveal min-w-0 rounded-2xl border border-orange-100 bg-white p-4 shadow-soft sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-myinder-navy">Revenue overview</h2>
          <p className="mt-1 text-xs text-myinder-muted">Successful invoice payments over the selected period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currencies.length > 1 && <label className="sr-only" htmlFor="revenue-currency">Revenue chart currency</label>}
          {currencies.length > 1 && (
            <select
              id="revenue-currency"
              value={currency}
              onChange={(event) => onCurrencyChange(event.target.value)}
              className="rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-xs font-semibold text-myinder-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-myinder-orange"
            >
              {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          <div className="flex w-fit rounded-full bg-orange-50 p-1" role="group" aria-label="Revenue chart period">
            {periods.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={period === item.id}
                onClick={() => onPeriodChange(item.id)}
                className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 ${period === item.id ? "bg-myinder-orange text-white shadow-sm" : "text-myinder-muted hover:text-myinder-navy"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-2xl font-extrabold tabular-nums text-myinder-navy sm:text-3xl">
          {points.some((point) => point.amount > 0)
            ? formatMoney(points.reduce((total, point) => total + point.amount, 0), currency)
            : "—"}
        </p>
        <p className="text-xs text-myinder-muted">{period === "week" ? "Last 7 days" : period === "month" ? monthLabel : year} · {currency}</p>
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center text-sm text-myinder-muted">Loading revenue data...</div>
      ) : error ? (
        <div className="grid h-64 place-items-center text-center text-sm text-myinder-muted">Revenue data is unavailable.</div>
      ) : points.some((point) => point.amount > 0) ? (
        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={`Successful payment revenue over ${periodLabel}, in ${currency}`}
            className="h-56 w-full overflow-visible sm:h-72"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ff9b54" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#ffb17b" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((line) => {
              const y = 18 + (line / 4) * (chartHeight - 58);
              const amount = (maxRevenue * (4 - line)) / 4;
              return (
                <g key={line}>
                  <line x1="54" y1={y} x2={chartWidth - 22} y2={y} stroke="#e9edf3" strokeWidth="1" />
                  <text x="46" y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{formatMoney(amount, currency)}</text>
                </g>
              );
            })}
            <path d={areaPath} fill="url(#revenue-fill)" />
            <path d={chartPath} fill="none" stroke="#dc7b35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="dashboard-chart-line" />
            {points.map((point, index) => {
              const x = 54 + (index / Math.max(points.length - 1, 1)) * (chartWidth - 76);
              const y = 18 + (1 - point.amount / maxRevenue) * (chartHeight - 58);
              const showLabel = period !== "week" || index % 2 === 0;
              return (
                <g key={`${point.timestamp}-${index}`}>
                  {point.amount > 0 && <circle cx={x} cy={y} r="4.5" fill="#dc7b35" stroke="white" strokeWidth="2" />}
                  {showLabel && <text x={x} y={chartHeight - 12} textAnchor="middle" className="fill-slate-500 text-[10px]">{point.label}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="grid h-56 place-items-center rounded-xl bg-orange-50/40 px-5 text-center text-sm text-myinder-muted sm:h-72">
          No successful payment revenue with dates is available for this period.
        </div>
      )}
    </article>
  );
}
