"use client";

import { StatusBadge } from "../ui/StatusBadge";
import type { AppointmentStatus } from "../../types/healthflow";

function appointmentStatusVariant(status: AppointmentStatus): "success" | "warning" | "error" | "info" | "neutral" | "purple" {
  switch (status) {
    case "CONFIRMED":
      return "info";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "MISSED":
      return "error";
    case "RESCHEDULE_REQUESTED":
      return "warning";
    case "SCHEDULED":
    default:
      return "neutral";
  }
}

function formatStatus(status: AppointmentStatus): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

type AppointmentStatusBadgeProps = {
  status: AppointmentStatus;
  dot?: boolean;
};

export function AppointmentStatusBadge({ status, dot = true }: AppointmentStatusBadgeProps) {
  return (
    <StatusBadge variant={appointmentStatusVariant(status)} dot={dot}>
      {formatStatus(status)}
    </StatusBadge>
  );
}
