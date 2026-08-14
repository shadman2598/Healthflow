import { hasPermission } from "@technovate/shared";
import { prisma } from "./prisma";
import { AppError } from "../errors/app-error";
import type { AuthContext } from "./permissions";
import { isStaff } from "./permissions";

/** Prisma filter: profiles a doctor may see (assigned PCP or shared appointment). */
export function doctorAccessibleProfilesWhere(doctorProfileId: string) {
  return {
    OR: [
      { assignedDoctorId: doctorProfileId },
      { appointments: { some: { doctorId: doctorProfileId } } }
    ]
  };
}

/**
 * Resource-level patient profile authorization (org-scoped callers still filter by org).
 * Uses granular permissions — not role name switches alone.
 */
export async function assertCanViewPatientProfile(auth: AuthContext, profileId: string): Promise<void> {
  if (hasPermission(auth.role, "patient:read_own")) {
    if (auth.patientProfileId !== profileId) throw new AppError("Forbidden", 403);
    return;
  }

  if (!isStaff(auth)) throw new AppError("Forbidden", 403);

  // Reception, nurse, billing, admin: clinic directory (still org-filtered by callers).
  if (hasPermission(auth.role, "patient:read_clinic")) {
    const profile = await prisma.patientProfile.findFirst({
      where: { id: profileId, organizationId: auth.activeOrganizationId },
      select: { id: true }
    });
    if (!profile) throw new AppError("Forbidden", 403);
    return;
  }

  // Clinician: assigned panel or shared appointment only.
  if (hasPermission(auth.role, "patient:read_assigned")) {
    if (!auth.doctorProfileId) throw new AppError("Forbidden", 403);
    const ok = await prisma.patientProfile.findFirst({
      where: {
        id: profileId,
        organizationId: auth.activeOrganizationId,
        ...doctorAccessibleProfilesWhere(auth.doctorProfileId)
      },
      select: { id: true }
    });
    if (!ok) throw new AppError("Forbidden", 403);
    return;
  }

  throw new AppError("Forbidden", 403);
}

export async function assertDoctorOwnsAppointment(
  auth: AuthContext,
  appointment: { doctorId: string | null }
): Promise<void> {
  if (!hasPermission(auth.role, "appointment:read_own_schedule")) return;
  if (auth.role !== "DOCTOR") return;
  if (!auth.doctorProfileId || appointment.doctorId !== auth.doctorProfileId) {
    throw new AppError("Forbidden", 403);
  }
}

/**
 * Doctors may open threads assigned to them, unassigned clinic inbox items,
 * or threads for patients already in their care panel.
 * Clinic message readers (reception/nurse/admin) may open org threads.
 */
export async function assertCanAccessMessageThread(
  auth: AuthContext,
  thread: { patientProfileId: string; assignedDoctorId: string | null }
): Promise<void> {
  if (hasPermission(auth.role, "message:read_own")) {
    if (auth.patientProfileId !== thread.patientProfileId) throw new AppError("Forbidden", 403);
    return;
  }

  if (hasPermission(auth.role, "message:read_clinic")) return;

  if (hasPermission(auth.role, "message:read_assigned_inbox")) {
    if (!auth.doctorProfileId) throw new AppError("Forbidden", 403);
    if (thread.assignedDoctorId === auth.doctorProfileId || thread.assignedDoctorId === null) {
      return;
    }
    await assertCanViewPatientProfile(auth, thread.patientProfileId);
    return;
  }

  throw new AppError("Forbidden", 403);
}
