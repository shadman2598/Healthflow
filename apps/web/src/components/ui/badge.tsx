import { cn } from "../../lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
};

const variants = {
  default: "bg-brand-50 text-brand-700 ring-brand-600/20",
  secondary: "bg-slate-100 text-slate-700",
  success: "bg-teal-50 text-teal-700",
  warning: "bg-amber-50 text-amber-700",
  destructive: "bg-red-50 text-red-700",
  outline: "border border-slate-200 text-slate-700"
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
