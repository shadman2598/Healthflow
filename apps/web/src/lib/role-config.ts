import type { HealthFlowRole } from "../types/healthflow";

export type NavIconKey =
  | "dashboard"
  | "calendar"
  | "chat"
  | "search"
  | "users"
  | "shield"
  | "alert"
  | "settings"
  | "help"
  | "clipboard";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: NavIconKey;
};

export const ROLE_NAV: Record<
  "PATIENT" | "RECEPTIONIST" | "DOCTOR" | "NURSE" | "BILLING" | "ADMIN",
  NavItemConfig[]
> = {
  PATIENT: [
    { href: "/patient/dashboard", label: "Home", icon: "dashboard" },
    { href: "/patient/book", label: "Book a visit", icon: "calendar" },
    { href: "/patient/visits", label: "My visits", icon: "clipboard" },
    { href: "/messages", label: "Message clinic", icon: "chat" },
    { href: "/resources", label: "Find a place", icon: "search" },
    { href: "/faq", label: "Help", icon: "help" },
    { href: "/patient/profile", label: "My info", icon: "settings" }
  ],
  RECEPTIONIST: [
    { href: "/receptionist/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/analytics", label: "Outcomes", icon: "clipboard" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/messages", label: "Messages", icon: "chat" },
    { href: "/reminders", label: "Reminders", icon: "alert" },
    { href: "/overdue-checkups", label: "Overdue Checkups", icon: "alert" },
    { href: "/resources", label: "Fees & Resources", icon: "search" },
    { href: "/faq", label: "FAQ", icon: "help" },
    { href: "/receptionist/settings", label: "Settings", icon: "settings" }
  ],
  DOCTOR: [
    { href: "/doctor/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/doctor/cockpit", label: "Cockpit", icon: "clipboard" },
    { href: "/admin/analytics", label: "Outcomes", icon: "clipboard" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/messages", label: "Messages", icon: "chat" },
    { href: "/resources", label: "Fees & Resources", icon: "search" },
    { href: "/faq", label: "FAQ", icon: "help" }
  ],
  NURSE: [
    { href: "/receptionist/dashboard", label: "Today", icon: "dashboard" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/messages", label: "Messages", icon: "chat" },
    { href: "/resources", label: "Places", icon: "search" },
    { href: "/faq", label: "Help", icon: "help" }
  ],
  BILLING: [
    { href: "/resources", label: "Fees & Resources", icon: "search" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/faq", label: "FAQ", icon: "help" }
  ],
  ADMIN: [
    { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/analytics", label: "Analytics", icon: "clipboard" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/admin/staff", label: "Staff", icon: "users" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/messages", label: "Messages", icon: "chat" },
    { href: "/reminders", label: "Reminders", icon: "alert" },
    { href: "/overdue-checkups", label: "Overdue Checkups", icon: "alert" },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: "shield" },
    { href: "/resources", label: "Fees & Resources", icon: "search" },
    { href: "/faq", label: "FAQ", icon: "help" },
    { href: "/admin/settings", label: "Settings", icon: "settings" }
  ]
};

export function normalizeRole(role: HealthFlowRole): keyof typeof ROLE_NAV {
  if (role === "SUPER_ADMIN") return "ADMIN";
  if (role === "DOCTOR") return "DOCTOR";
  return role;
}

export function roleDashboardPath(role: HealthFlowRole): string {
  switch (role) {
    case "PATIENT":
      return "/patient/dashboard";
    case "RECEPTIONIST":
    case "NURSE":
      return "/receptionist/dashboard";
    case "DOCTOR":
      return "/doctor/dashboard";
    case "BILLING":
      return "/resources";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    default:
      return "/login";
  }
}

export function roleLoginPath(role: HealthFlowRole): string {
  switch (role) {
    case "PATIENT":
      return "/login/patient";
    case "RECEPTIONIST":
    case "NURSE":
      return "/login/receptionist";
    case "DOCTOR":
      return "/login/doctor";
    case "BILLING":
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/login/admin";
    default:
      return "/login";
  }
}

export const LOGIN_PORTALS: {
  role: keyof typeof ROLE_NAV;
  href: string;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    role: "PATIENT",
    href: "/login/patient",
    title: "Patient Portal",
    description: "View appointments, message your care team, and find resources.",
    accent: "from-brand-600 to-teal-600"
  },
  {
    role: "RECEPTIONIST",
    href: "/login/receptionist",
    title: "Receptionist",
    description: "Manage scheduling, patient intake, and clinic communications.",
    accent: "from-brand-600 to-brand-700"
  },
  {
    role: "DOCTOR",
    href: "/login/doctor",
    title: "Doctor",
    description: "Review your schedule, patient messages, and clinical tasks.",
    accent: "from-teal-600 to-brand-600"
  },
  {
    role: "ADMIN",
    href: "/login/admin",
    title: "Administrator",
    description: "Clinic oversight, audit logs, and staff management.",
    accent: "from-brand-700 to-teal-700"
  }
];

export const APPOINTMENT_CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CHECKUP: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  FOLLOW_UP: { bg: "bg-brand-50", text: "text-brand-700", dot: "bg-brand-500" },
  MEDICATION: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  LAB_REVIEW: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  URGENT: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  CONSULTATION: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  OTHER: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" }
};
