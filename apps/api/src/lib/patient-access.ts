import { prisma } from "./prisma";
import { AppError } from "../errors/app-error";
import type { AuthContext } from "./permissions";
import { isClinicOps, isStaff } from "./permissions";

/** Prisma filter: profiles a doctor may see (assigned PCP or shared appointment). */
export function doctorAccessibleProfilesWhere(doctorProfileId: string) {
  return {
    OR: [
      { assignedDoctorId: doctorProfileId },
      { appointments: { some: { doctorId: doctorProfileId } } }
    ]
  };
}

export async function assertCanViewPatientProfile(auth: AuthContext, profileId: string): Promise<void> {
  if (auth.role === "PATIENT") {
    if (auth.patientProfileId !== profileId) throw new AppError("Forbidden", 403);
    return;
  }

  if (!isStaff(auth)) throw new AppError("Forbidden", 403);

  if (isClinicOps(auth)) return;

  if (auth.role === "DOCTOR") {
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
  if (auth.role !== "DOCTOR") return;
  if (!auth.doctorProfileId || appointment.doctorId !== auth.doctorProfileId) {
    throw new AppError("Forbidden", 403);
  }
}

/**
 * Doctors may open threads assigned to them, unassigned clinic inbox items,
 * or threads for patients already in their care panel.
 */
export async function assertCanAccessMessageThread(
  auth: AuthContext,
  thread: { patientProfileId: string; assignedDoctorId: string | null }
): Promise<void> {
  if (auth.role === "PATIENT") {
    if (auth.patientProfileId !== thread.patientProfileId) throw new AppError("Forbidden", 403);
    return;
  }

  if (isClinicOps(auth)) return;

  if (auth.role === "DOCTOR") {
    if (!auth.doctorProfileId) throw new AppError("Forbidden", 403);
    if (thread.assignedDoctorId === auth.doctorProfileId || thread.assignedDoctorId === null) {
      return;
    }
    await assertCanViewPatientProfile(auth, thread.patientProfileId);
    return;
  }

  throw new AppError("Forbidden", 403);
}
