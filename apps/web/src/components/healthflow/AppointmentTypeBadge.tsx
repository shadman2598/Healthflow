import { APPOINTMENT_CATEGORY_COLORS } from "../../lib/role-config";
import { cn } from "../../lib/utils";

type AppointmentTypeBadgeProps = {
  category: string;
};

export function AppointmentTypeBadge({ category }: AppointmentTypeBadgeProps) {
  const colors = APPOINTMENT_CATEGORY_COLORS[category] ?? APPOINTMENT_CATEGORY_COLORS.OTHER;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5", colors.bg, colors.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
      {category.replace("_", " ")}
    </span>
  );
}
