"use client";

type KpiCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  iconBg?: string;
};

export function KpiCard({ title, value, icon, trend, iconBg = "bg-brand-50 text-brand-600" }: KpiCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          {trend ? (
            <p className={`mt-1 text-xs font-medium ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          ) : null}
        </div>
        <div className={`rounded-xl p-3 ${iconBg}`}>{icon}</div>
      </div>
    </div>
  );
}
