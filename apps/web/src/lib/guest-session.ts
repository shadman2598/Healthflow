import type { HealthFlowUser } from "../types/healthflow";
import { roleDashboardPath } from "./role-config";

export const GUEST_STORAGE_KEY = "healthflow.guest";

export type GuestRole = "PATIENT" | "DOCTOR" | "RECEPTIONIST";

const GUEST_ORG = {
  id: "guest-org",
  name: "HealthFlow Demo Clinic",
  createdAt: new Date(0).toISOString()
};

function guestBase(role: GuestRole): Omit<HealthFlowUser, "patientProfile" | "doctorProfile" | "staffProfile"> {
  return {
    id: `guest-${role.toLowerCase()}`,
    email: `guest.${role.toLowerCase()}@healthflow.local`,
    role,
    createdAt: new Date(0).toISOString(),
    organizationId: GUEST_ORG.id,
    activeOrganizationId: GUEST_ORG.id,
    organization: GUEST_ORG,
    redirectTo: roleDashboardPath(role)
  };
}

export function guestUserFor(role: GuestRole): HealthFlowUser {
  if (role === "PATIENT") {
    return {
      ...guestBase(role),
      patientProfile: {
        id: "guest-patient",
        firstName: "Guest",
        lastName: "Patient",
        phone: "",
        healthcareNumber: undefined,
        dateOfBirth: null
      }
    };
  }
  if (role === "DOCTOR") {
    return {
      ...guestBase(role),
      doctorProfile: {
        id: "guest-doctor",
        firstName: "Guest",
        lastName: "Doctor",
        specialty: "Family medicine"
      }
    };
  }
  return {
    ...guestBase(role),
    staffProfile: {
      id: "guest-staff",
      firstName: "Guest",
      lastName: "Reception"
    }
  };
}

/** @deprecated Use guestUserFor("PATIENT") — kept for older patient pages. */
export const GUEST_USER: HealthFlowUser = guestUserFor("PATIENT");

export function parseGuestRole(raw: string | null | undefined): GuestRole | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase();
  if (n === "1" || n === "patient") return "PATIENT";
  if (n === "doctor") return "DOCTOR";
  if (n === "receptionist") return "RECEPTIONIST";
  return null;
}

function storedGuestRole(): GuestRole | null {
  if (typeof window === "undefined") return null;
  try {
    return parseGuestRole(window.localStorage.getItem(GUEST_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function isGuestSession(): boolean {
  return storedGuestRole() !== null;
}

export function startGuestSession(role: GuestRole = "PATIENT"): void {
  window.localStorage.setItem(GUEST_STORAGE_KEY, role);
}

export function clearGuestSession(): void {
  try {
    window.localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getGuestUser(): HealthFlowUser | null {
  const role = storedGuestRole();
  return role ? guestUserFor(role) : null;
}
