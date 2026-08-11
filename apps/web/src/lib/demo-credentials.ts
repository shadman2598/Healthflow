import type { HealthFlowRole } from "../types/healthflow";

export type DemoCredential = {
  email: string;
  password: string;
  label: string;
};

export const DEMO_CREDENTIALS: Record<"PATIENT" | "DOCTOR" | "RECEPTIONIST" | "ADMIN", DemoCredential> = {
  PATIENT: {
    label: "Demo patient",
    email: "patient1@healthflow.demo",
    password: "Patient123!"
  },
  DOCTOR: {
    label: "Demo doctor",
    email: "doctor1@healthflow.demo",
    password: "Staff123!"
  },
  RECEPTIONIST: {
    label: "Demo receptionist",
    email: "receptionist1@healthflow.demo",
    password: "Staff123!"
  },
  ADMIN: {
    label: "Demo administrator",
    email: "admin@healthflow.demo",
    password: "Admin123!"
  }
};

export const DEMO_INVITE_CODES = {
  DOCTOR: "HF-DOCTOR-2026",
  RECEPTIONIST: "HF-RECEPT-2026"
} as const;

/** Show demo login hints in local development. */
export const SHOW_DEMO_HELP =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

export function getDemoCredential(role: HealthFlowRole): DemoCredential | null {
  if (role === "SUPER_ADMIN") return DEMO_CREDENTIALS.ADMIN;
  return DEMO_CREDENTIALS[role as keyof typeof DEMO_CREDENTIALS] ?? null;
}
