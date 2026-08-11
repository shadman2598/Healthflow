import type { HealthFlowUser } from "../types/healthflow";

export const GUEST_STORAGE_KEY = "healthflow.guest";

export const GUEST_USER: HealthFlowUser = {
  id: "guest-user",
  email: "guest@healthflow.local",
  role: "PATIENT",
  createdAt: new Date(0).toISOString(),
  organizationId: "guest-org",
  activeOrganizationId: "guest-org",
  organization: {
    id: "guest-org",
    name: "HealthFlow Demo Clinic",
    createdAt: new Date(0).toISOString()
  },
  redirectTo: "/patient/dashboard",
  patientProfile: {
    id: "guest-patient",
    firstName: "Guest",
    lastName: "Visitor",
    phone: "",
    healthcareNumber: undefined,
    dateOfBirth: null
  }
};

export function isGuestSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function startGuestSession(): void {
  window.localStorage.setItem(GUEST_STORAGE_KEY, "1");
}

export function clearGuestSession(): void {
  try {
    window.localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getGuestUser(): HealthFlowUser | null {
  return isGuestSession() ? GUEST_USER : null;
}
