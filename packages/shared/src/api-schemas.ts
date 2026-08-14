import { z } from "zod";

export const userRoleSchema = z.enum([
  "PATIENT",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "BILLING",
  "ADMIN",
  "SUPER_ADMIN"
]);

export const appointmentStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "RESCHEDULE_REQUESTED",
  "MISSED"
]);

export const appointmentCategorySchema = z.enum([
  "CHECKUP",
  "FOLLOW_UP",
  "MEDICATION",
  "LAB_REVIEW",
  "URGENT",
  "CONSULTATION",
  "OTHER"
]);

export const idParamSchema = z.object({ id: z.string().min(1) });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const patientSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(5),
  healthcareNumber: z.string().min(4),
  dateOfBirth: z.string().datetime().optional(),
  privacyConsent: z.literal(true)
});

export const staffSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  inviteCode: z.string().min(6),
  role: z.enum(["RECEPTIONIST", "DOCTOR", "NURSE", "BILLING"])
});

export const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["RECEPTIONIST", "DOCTOR", "NURSE", "BILLING", "ADMIN"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationId: z.string().min(1).optional()
});

export const selectClinicSchema = z.object({
  organizationId: z.string().min(1)
});

export const createPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5)
});

export const createPatientProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
  healthcareNumber: z.string().min(4),
  dateOfBirth: z.string().datetime().optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  address: z.string().optional(),
  internalNotes: z.string().optional(),
  assignedDoctorId: z.string().optional(),
  isRegularPatient: z.boolean().optional(),
  reminderPrefEmail: z.boolean().optional(),
  reminderPrefSms: z.boolean().optional(),
  reminderPrefApp: z.boolean().optional(),
  reminderFrequency: z.enum(["DAY_BEFORE", "WEEKLY", "EVERY_DAY"]).optional()
});

export const updatePatientProfileSchema = createPatientProfileSchema.partial().extend({
  /** Explicit confirmation to change protected demographics (name / HCN). */
  allowOverwriteDemographics: z.boolean().optional()
});

/** Patients may only update their own reminder channel + frequency preferences. */
export const patientReminderPrefsSchema = z.object({
  reminderPrefEmail: z.boolean().optional(),
  reminderPrefSms: z.boolean().optional(),
  reminderPrefApp: z.boolean().optional(),
  reminderFrequency: z.enum(["DAY_BEFORE", "WEEKLY", "EVERY_DAY"]).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  /** Hard opt-out of non-critical notifications. */
  notificationsOptOut: z.boolean().optional(),
  /** Prefer only notifications that require a patient action. */
  notificationsActionOnly: z.boolean().optional(),
  notificationLocale: z.enum(["en-CA", "fr_CA"]).optional()
});

export const notificationEngagementSchema = z.object({
  engagement: z.enum(["opened", "acted_upon", "ignored", "dismissed"])
});

export const analyticsEventSchema = z.object({
  name: z.string().min(1),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export const updatePatientSchema = createPatientSchema.partial();

export const appointmentsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: appointmentStatusSchema.optional(),
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  profileId: z.string().optional(),
  category: appointmentCategorySchema.optional()
});

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  profileId: z.string().optional(),
  doctorId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(60).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(60).optional(),
  location: z.string().min(1).max(80).optional(),
  allowDoubleBook: z.boolean().optional(),
  externalSyncId: z.string().min(1).max(120).optional(),
  reason: z.string().optional(),
  patientNotes: z.string().optional(),
  staffNotes: z.string().optional(),
  category: appointmentCategorySchema.default("CHECKUP"),
  status: appointmentStatusSchema.default("SCHEDULED"),
  idempotencyKey: z.string().min(8).max(120).optional(),
  bypassAvailability: z.boolean().optional()
});

export const schedulingSlotsQuerySchema = z.object({
  doctorId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  category: appointmentCategorySchema.optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  location: z.string().optional()
});

export const createAvailabilitySchema = z.object({
  doctorId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(1).max(24 * 60),
  location: z.string().default("main"),
  bufferBeforeMinutes: z.number().int().min(0).max(60).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(60).default(5),
  allowDoubleBook: z.boolean().default(false)
});

export const createScheduleBlockSchema = z.object({
  doctorId: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  location: z.string().optional(),
  reason: z.string().max(300).optional()
});

export const createWaitlistSchema = z.object({
  profileId: z.string().min(1),
  doctorId: z.string().optional(),
  category: appointmentCategorySchema.optional(),
  preferredFrom: z.string().datetime(),
  preferredTo: z.string().datetime(),
  notes: z.string().max(500).optional()
});

export const rescheduleAppointmentSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  doctorId: z.string().optional(),
  location: z.string().optional(),
  idempotencyKey: z.string().min(8).max(120).optional()
});

export const updateAppointmentSchema = z.object({
  patientId: z.string().min(1).optional(),
  doctorId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  reason: z.string().nullable().optional(),
  patientNotes: z.string().nullable().optional(),
  staffNotes: z.string().nullable().optional(),
  category: appointmentCategorySchema.optional(),
  status: appointmentStatusSchema.optional(),
  checkedInAt: z.string().datetime().nullable().optional(),
  /** Required to replace non-empty patient-provided notes (Prompt 36). */
  allowOverwritePatientNotes: z.boolean().optional(),
  /** Required to replace a non-empty visit reason when policy is fill_if_empty. */
  allowOverwriteReason: z.boolean().optional()
});

export const updateReminderRuleSchema = z.object({ enabled: z.boolean() });

export const reminderLogsQuerySchema = z.object({
  appointmentId: z.string().optional(),
  patientId: z.string().optional()
});

export const createMessageThreadSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  priority: z.enum(["NORMAL", "HIGH"]).default("NORMAL")
});

export const replyMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false)
});

export const updateThreadSchema = z.object({
  status: z.enum(["UNREAD", "READ", "PENDING", "RESOLVED", "ARCHIVED"]).optional(),
  assignedDoctorId: z.string().nullable().optional(),
  priority: z.enum(["NORMAL", "HIGH"]).optional()
});

export const createReminderSchema = z.object({
  appointmentId: z.string().min(1),
  offsetMinutes: z.number().int().positive(),
  channel: z.enum(["EMAIL", "SMS", "IN_APP"]).default("EMAIL"),
  dailyUntilAppt: z.boolean().default(false)
});

export const resourceSearchSchema = z.object({
  postalCode: z.string().min(3),
  category: z.string().min(1)
});

export const patientsQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["name", "visits", "recent", "upcoming", "newest"]).default("name")
});

export const createInviteSchema = z.object({
  role: z.enum(["RECEPTIONIST", "DOCTOR", "NURSE", "BILLING"]),
  email: z.string().email().optional(),
  expiresInDays: z.number().int().positive().default(30)
});

export const createAiArtifactSchema = z.object({
  capabilityId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  inputText: z.string().max(8000).optional(),
  subject: z.string().max(200).optional(),
  visitWhen: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  sources: z
    .array(
      z.object({
        ref: z.string().min(1),
        label: z.string().max(200).optional(),
        excerpt: z.string().max(500).optional()
      })
    )
    .max(20)
    .default([])
});

export const reviewAiArtifactSchema = z.object({
  decision: z.enum(["reviewed", "rejected"]),
  notes: z.string().max(2000).optional()
});

export const nextActionDecisionSchema = z.object({
  auditKey: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
  snapshot: z.record(z.unknown()).optional()
});
