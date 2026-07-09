"use client";

const variants = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-blue-50 text-blue-700 ring-blue-600/20",
  neutral: "bg-slate-50 text-slate-600 ring-slate-500/20",
  purple: "bg-purple-50 text-purple-700 ring-purple-600/20"
} as const;

type StatusBadgeProps = {
  variant: keyof typeof variants;
  children: React.ReactNode;
  dot?: boolean;
};

export function StatusBadge({ variant, children, dot = false }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${variants[variant]}`}>
      {dot ? (
        <span className={`h-1.5 w-1.5 rounded-full ${
          variant === "success" ? "bg-emerald-500" :
          variant === "warning" ? "bg-amber-500" :
          variant === "error" ? "bg-red-500" :
          variant === "info" ? "bg-blue-500" :
          variant === "purple" ? "bg-purple-500" :
          "bg-slate-400"
        }`} />
      ) : null}
      {children}
    </span>
  );
}

export function appointmentStatusVariant(status: string): keyof typeof variants {
  switch (status) {
    case "SCHEDULED": return "info";
    case "COMPLETED": return "success";
    case "CANCELLED": return "error";
    default: return "neutral";
  }
}

export function reminderStatusVariant(status: string): keyof typeof variants {
  switch (status) {
    case "SENT": return "success";
    case "PENDING": return "warning";
    case "FAILED": return "error";
    default: return "neutral";
  }
}
