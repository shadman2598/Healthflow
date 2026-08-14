import {
  createConnectorRegistry,
  createEhrConnectorStub,
  createHealthFlowAdapter,
  type LocalFhirStore
} from "@technovate/shared";
import { prisma } from "./prisma";

function mapAppointment(a: {
  id: string;
  status: string;
  scheduledAt: Date;
  durationMinutes: number;
  reason: string | null;
  profileId: string | null;
  doctorId: string | null;
  organizationId: string;
  checkedInAt: Date | null;
  profile?: { firstName: string; lastName: string } | null;
  doctor?: { firstName: string; lastName: string } | null;
  patient?: { firstName: string; lastName: string } | null;
}) {
  return {
    id: a.id,
    status: a.status,
    scheduledAt: a.scheduledAt,
    durationMinutes: a.durationMinutes,
    reason: a.reason,
    profileId: a.profileId,
    doctorId: a.doctorId,
    organizationId: a.organizationId,
    checkedInAt: a.checkedInAt,
    patientName: a.profile
      ? `${a.profile.firstName} ${a.profile.lastName}`
      : a.patient
        ? `${a.patient.firstName} ${a.patient.lastName}`
        : undefined,
    doctorName: a.doctor ? `Dr. ${a.doctor.firstName} ${a.doctor.lastName}` : undefined
  };
}

export const healthFlowFhirStore: LocalFhirStore = {
  async getPatient(id, orgId) {
    const profile = await prisma.patientProfile.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!profile) return null;
    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      healthcareNumber: profile.healthcareNumber,
      dateOfBirth: profile.dateOfBirth,
      organizationId: profile.organizationId
    };
  },

  async getPractitioner(id, orgId) {
    const doctor = await prisma.doctorProfile.findFirst({
      where: { id, organizationId: orgId },
      include: { user: { select: { email: true } } }
    });
    if (!doctor) return null;
    return {
      id: doctor.id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      specialty: doctor.specialty,
      email: doctor.user.email,
      organizationId: doctor.organizationId
    };
  },

  async getOrganization(id) {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return null;
    return { id: org.id, name: org.name };
  },

  async getAppointment(id, orgId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId: orgId },
      include: { profile: true, doctor: true, patient: true }
    });
    if (!appointment) return null;
    return mapAppointment(appointment);
  },

  async listAppointmentsForPatient(profileId, orgId) {
    const rows = await prisma.appointment.findMany({
      where: { profileId, organizationId: orgId },
      include: { profile: true, doctor: true, patient: true },
      orderBy: { scheduledAt: "desc" },
      take: 20
    });
    return rows.map(mapAppointment);
  }
};

export const interopRegistry = createConnectorRegistry(createHealthFlowAdapter(healthFlowFhirStore), [
  createEhrConnectorStub("Epic"),
  createEhrConnectorStub("Cerner")
]);

/** In-memory idempotency cache for interop writes (demo). Replace with Redis in production. */
const idempotencyCache = new Map<
  string,
  { requestHash: string; status: number; body: unknown; expiresAt: number }
>();

export function readIdempotentResponse(
  key: string,
  requestHash: string
): { status: number; body: unknown } | null {
  const hit = idempotencyCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  if (hit.requestHash !== requestHash) {
    return { status: 409, body: { error: "Idempotency-Key reuse with different payload" } };
  }
  return { status: hit.status, body: hit.body };
}

export function storeIdempotentResponse(
  key: string,
  requestHash: string,
  status: number,
  body: unknown,
  ttlMs = 24 * 3600_000
): void {
  idempotencyCache.set(key, {
    requestHash,
    status,
    body,
    expiresAt: Date.now() + ttlMs
  });
}
