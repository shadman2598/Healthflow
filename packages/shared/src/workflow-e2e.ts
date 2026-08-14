/**
 * Healthcare workflow end-to-end harness (Prompt 46).
 *
 * Simulates complete clinic journeys (patient / receptionist / clinician) against
 * shared domain engines — not isolated component unit tests. Mutations are
 * rejected safely under failure conditions so care state stays coherent.
 *
 * Browser/UI E2E can wrap the same journey scripts once a test DB is wired;
 * this harness is the CI-safe source of truth for workflow safety.
 */

import { assertAiAllowed, generateStubContent } from "./ai-safety";
import { buildClinicianBrief } from "./clinician-cockpit";
import { buildFrontDeskBoard, measureDeskWorkflowClicks } from "./front-desk-os";
import { decideNotification, type NotificationDecision } from "./notification-intelligence";
import { computeNextActions, type OpsAppointment } from "./next-action";
import { resolvePatientNextStep, type JourneyStepId } from "./patient-journey";
import { hasPermission, type Permission, type RbacRole } from "./rbac";
import {
  validateBooking,
  type AppointmentCategoryCode,
  type BookingRuleContext,
  type OccupiedSlot,
  type WeeklyAvailabilityWindow
} from "./scheduling-engine";

export const WORKFLOW_E2E_VERSION = "hf-workflow-e2e-v1";

export type WorkflowFailureCode =
  | "NETWORK_FAILURE"
  | "DOUBLE_BOOKING"
  | "INTEGRATION_FAILURE"
  | "SESSION_EXPIRED"
  | "UNAUTHORIZED"
  | "MISSING_PATIENT_DATA"
  | "NOTIFICATION_FAILURE"
  | "DUPLICATE_REQUEST"
  | "CONFLICTING_UPDATE"
  | "INVALID_TRANSITION"
  | "BOOKING_RULE";

export type AppointmentLifecycleStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "RESCHEDULE_REQUESTED"
  | "CANCELLED"
  | "MISSED"
  | "COMPLETED";

export type WorkflowActor = {
  id: string;
  role: RbacRole;
  organizationId: string;
  /** ISO expiry; if set and now >= expiry, mutations fail SESSION_EXPIRED. */
  sessionExpiresAt?: string;
};

export type WorkflowPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  healthcareNumber?: string | null;
  dateOfBirth?: string | null;
  registered: boolean;
  prepProgress: number;
};

export type WorkflowAppointment = {
  id: string;
  patientId: string;
  doctorId: string;
  organizationId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentLifecycleStatus;
  category: AppointmentCategoryCode;
  reason?: string;
  checkedInAt?: string | null;
  /** Optimistic concurrency token. */
  version: number;
  location: string;
};

export type WorkflowEncounter = {
  id: string;
  appointmentId: string;
  status: "planned" | "in_progress" | "finished";
  documentationDraft?: string;
  documentationAttested: boolean;
};

export type WorkflowOrder = {
  id: string;
  appointmentId: string;
  patientId: string;
  label: string;
  status: "pending" | "scheduled" | "completed" | "cancelled";
};

export type WorkflowResult = {
  id: string;
  patientId: string;
  appointmentId: string;
  label: string;
  status: "pending" | "ready_for_review" | "released";
  external: boolean;
};

export type WorkflowAuditEntry = {
  at: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ok: boolean;
  code?: string;
};

export type WorkflowOk<T> = { ok: true; data: T; stateChanged: boolean };
export type WorkflowErr = {
  ok: false;
  code: WorkflowFailureCode;
  message: string;
  /** Always true for rejected mutations — no partial clinical writes. */
  stateUnchanged: true;
};

export type WorkflowResultT<T> = WorkflowOk<T> | WorkflowErr;

export type ClinicWorldOptions = {
  now?: Date;
  networkDown?: boolean;
  integrationDown?: boolean;
  notificationChannelDown?: boolean;
};

/** Wide windows so harness slots are timezone-stable in CI. */
const DEFAULT_AVAILABILITY: WeeklyAvailabilityWindow[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 0,
  endMinute: 24 * 60,
  location: "Main"
}));

function err(code: WorkflowFailureCode, message: string): WorkflowErr {
  return { ok: false, code, message, stateUnchanged: true };
}

function snapshotJson(world: ClinicWorld): string {
  return JSON.stringify({
    patients: [...world.patients.entries()],
    appointments: [...world.appointments.entries()],
    encounters: [...world.encounters.entries()],
    orders: [...world.orders.entries()],
    results: [...world.results.entries()],
    threads: world.threads,
    notifications: world.notifications,
    seenIdempotency: [...world.seenIdempotency]
  });
}

/**
 * In-memory clinic OS used to drive multi-role healthcare journeys.
 */
export class ClinicWorld {
  now: Date;
  networkDown: boolean;
  integrationDown: boolean;
  notificationChannelDown: boolean;
  availability: WeeklyAvailabilityWindow[];

  actors = new Map<string, WorkflowActor>();
  patients = new Map<string, WorkflowPatient>();
  appointments = new Map<string, WorkflowAppointment>();
  encounters = new Map<string, WorkflowEncounter>();
  orders = new Map<string, WorkflowOrder>();
  results = new Map<string, WorkflowResult>();
  threads: Array<{ id: string; status: string; subject: string; patientId?: string }> = [];
  notifications: Array<{ id: string; decision: NotificationDecision; delivered: boolean }> = [];
  audit: WorkflowAuditEntry[] = [];
  seenIdempotency = new Set<string>();
  private seq = 0;

  constructor(opts: ClinicWorldOptions = {}) {
    this.now = opts.now ?? new Date("2026-06-10T14:00:00.000Z");
    this.networkDown = opts.networkDown ?? false;
    this.integrationDown = opts.integrationDown ?? false;
    this.notificationChannelDown = opts.notificationChannelDown ?? false;
    this.availability = DEFAULT_AVAILABILITY;
  }

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private auditWrite(
    actor: WorkflowActor,
    action: string,
    resourceType: string,
    resourceId: string,
    ok: boolean,
    code?: string
  ): void {
    this.audit.push({
      at: this.now.toISOString(),
      actorId: actor.id,
      action,
      resourceType,
      resourceId,
      ok,
      code
    });
  }

  private gate(
    actor: WorkflowActor,
    permission: Permission,
    idempotencyKey?: string
  ): WorkflowErr | null {
    if (this.networkDown) {
      return err("NETWORK_FAILURE", "Network unavailable — no clinic state was changed");
    }
    if (actor.sessionExpiresAt && new Date(actor.sessionExpiresAt).getTime() <= this.now.getTime()) {
      return err("SESSION_EXPIRED", "Session expired — re-authenticate before continuing care actions");
    }
    if (!hasPermission(actor.role, permission)) {
      return err("UNAUTHORIZED", `Role ${actor.role} lacks ${permission}`);
    }
    if (idempotencyKey && this.seenIdempotency.has(idempotencyKey)) {
      return err("DUPLICATE_REQUEST", "Duplicate request ignored — prior successful mutation stands");
    }
    return null;
  }

  private markIdempotent(key?: string): void {
    if (key) this.seenIdempotency.add(key);
  }

  /** Assert rejected mutation left world bytes identical. */
  assertUnchanged(before: string): void {
    if (snapshotJson(this) !== before) {
      throw new Error("Workflow safety violation: state changed after failed mutation");
    }
  }

  captureSnapshot(): string {
    return snapshotJson(this);
  }

  seedActor(partial: Omit<WorkflowActor, "id"> & { id?: string }): WorkflowActor {
    const actor: WorkflowActor = {
      id: partial.id ?? this.nextId("actor"),
      role: partial.role,
      organizationId: partial.organizationId,
      sessionExpiresAt: partial.sessionExpiresAt
    };
    this.actors.set(actor.id, actor);
    return actor;
  }

  addThread(input: { status: string; subject: string; patientId?: string }): string {
    const id = this.nextId("thr");
    this.threads.push({ id, status: input.status, subject: input.subject, patientId: input.patientId });
    return id;
  }

  registerPatient(
    actor: WorkflowActor,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      healthcareNumber?: string;
      dateOfBirth?: string;
      idempotencyKey?: string;
    }
  ): WorkflowResultT<WorkflowPatient> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "patient:create", input.idempotencyKey);
    if (blocked) {
      this.auditWrite(actor, "patient.register", "Patient", "", false, blocked.code);
      this.assertUnchanged(before);
      return blocked;
    }
    if (!input.phone || !input.healthcareNumber || !input.dateOfBirth) {
      const e = err(
        "MISSING_PATIENT_DATA",
        "Registration requires phone, healthcare number, and date of birth for safe clinic workflows"
      );
      this.auditWrite(actor, "patient.register", "Patient", "", false, e.code);
      this.assertUnchanged(before);
      return e;
    }
    const patient: WorkflowPatient = {
      id: this.nextId("pt"),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      healthcareNumber: input.healthcareNumber,
      dateOfBirth: input.dateOfBirth,
      registered: true,
      prepProgress: 0
    };
    this.patients.set(patient.id, patient);
    this.markIdempotent(input.idempotencyKey);
    this.auditWrite(actor, "patient.register", "Patient", patient.id, true);
    return { ok: true, data: patient, stateChanged: true };
  }

  bookAppointment(
    actor: WorkflowActor,
    input: {
      patientId: string;
      doctorId: string;
      scheduledAt: string;
      category?: AppointmentCategoryCode;
      reason?: string;
      durationMinutes?: number;
      allowDoubleBook?: boolean;
      idempotencyKey?: string;
    }
  ): WorkflowResultT<WorkflowAppointment> {
    const before = snapshotJson(this);
    const permission: Permission =
      actor.role === "DOCTOR" ? "appointment:create_own_schedule" : "appointment:create_clinic";
    const blocked = this.gate(actor, permission, input.idempotencyKey);
    if (blocked) {
      this.auditWrite(actor, "appointment.book", "Appointment", "", false, blocked.code);
      this.assertUnchanged(before);
      return blocked;
    }

    const patient = this.patients.get(input.patientId);
    if (!patient?.registered) {
      const e = err("MISSING_PATIENT_DATA", "Cannot book — patient not registered");
      this.auditWrite(actor, "appointment.book", "Appointment", "", false, e.code);
      this.assertUnchanged(before);
      return e;
    }

    const category = input.category ?? "CHECKUP";
    const durationMinutes = input.durationMinutes ?? 30;
    const occupied: OccupiedSlot[] = [...this.appointments.values()]
      .filter((a) => a.doctorId === input.doctorId && !["CANCELLED", "MISSED"].includes(a.status))
      .map((a) => ({
        id: a.id,
        startsAt: a.scheduledAt,
        durationMinutes: a.durationMinutes,
        location: a.location
      }));

    const ctx: BookingRuleContext = {
      doctorId: input.doctorId,
      specialty: "family",
      category,
      durationMinutes,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 5,
      allowDoubleBook: input.allowDoubleBook ?? false,
      location: "Main",
      scheduledAt: new Date(input.scheduledAt),
      occupied,
      blocks: [],
      availability: this.availability,
      eligibility: {
        hasHealthcareNumber: Boolean(patient.healthcareNumber),
        hasPhone: Boolean(patient.phone),
        hasDateOfBirth: Boolean(patient.dateOfBirth),
        isActivePatient: true
      },
      insurance: {
        category,
        hasHealthcareNumber: Boolean(patient.healthcareNumber)
      },
      now: this.now
    };

    const validation = validateBooking(ctx);
    if (!validation.ok) {
      const code: WorkflowFailureCode =
        validation.code === "DOUBLE_BOOKING" ? "DOUBLE_BOOKING" : "BOOKING_RULE";
      const e = err(code, validation.message);
      this.auditWrite(actor, "appointment.book", "Appointment", "", false, e.code);
      this.assertUnchanged(before);
      return e;
    }

    const appt: WorkflowAppointment = {
      id: this.nextId("appt"),
      patientId: patient.id,
      doctorId: input.doctorId,
      organizationId: actor.organizationId,
      scheduledAt: input.scheduledAt,
      durationMinutes,
      status: "SCHEDULED",
      category,
      reason: input.reason ?? "Visit",
      checkedInAt: null,
      version: 1,
      location: "Main"
    };
    this.appointments.set(appt.id, appt);
    this.markIdempotent(input.idempotencyKey);
    this.auditWrite(actor, "appointment.book", "Appointment", appt.id, true);
    return { ok: true, data: appt, stateChanged: true };
  }

  updateAppointmentStatus(
    actor: WorkflowActor,
    appointmentId: string,
    next: AppointmentLifecycleStatus,
    opts?: {
      checkIn?: boolean;
      rescheduleTo?: string;
      expectedVersion?: number;
      idempotencyKey?: string;
      permission?: Permission;
    }
  ): WorkflowResultT<WorkflowAppointment> {
    const before = snapshotJson(this);
    const permission =
      opts?.permission ??
      (actor.role === "PATIENT"
        ? "appointment:update_own_status"
        : actor.role === "DOCTOR"
          ? "appointment:update_own_schedule"
          : "appointment:update_clinic");
    const blocked = this.gate(actor, permission, opts?.idempotencyKey);
    if (blocked) {
      this.auditWrite(actor, "appointment.status", "Appointment", appointmentId, false, blocked.code);
      this.assertUnchanged(before);
      return blocked;
    }

    const appt = this.appointments.get(appointmentId);
    if (!appt) {
      const e = err("INVALID_TRANSITION", "Appointment not found");
      this.assertUnchanged(before);
      return e;
    }
    if (opts?.expectedVersion != null && opts.expectedVersion !== appt.version) {
      const e = err(
        "CONFLICTING_UPDATE",
        "Appointment changed by another user — refresh and retry (no overwrite applied)"
      );
      this.auditWrite(actor, "appointment.status", "Appointment", appointmentId, false, e.code);
      this.assertUnchanged(before);
      return e;
    }

    if (opts?.rescheduleTo) {
      const occupied: OccupiedSlot[] = [...this.appointments.values()]
        .filter(
          (a) =>
            a.id !== appt.id &&
            a.doctorId === appt.doctorId &&
            !["CANCELLED", "MISSED"].includes(a.status)
        )
        .map((a) => ({
          id: a.id,
          startsAt: a.scheduledAt,
          durationMinutes: a.durationMinutes,
          location: a.location
        }));
      const patient = this.patients.get(appt.patientId)!;
      const validation = validateBooking({
        doctorId: appt.doctorId,
        category: appt.category,
        durationMinutes: appt.durationMinutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 5,
        allowDoubleBook: false,
        location: appt.location,
        scheduledAt: new Date(opts.rescheduleTo),
        occupied,
        blocks: [],
        availability: this.availability,
        eligibility: {
          hasHealthcareNumber: Boolean(patient.healthcareNumber),
          hasPhone: Boolean(patient.phone),
          hasDateOfBirth: Boolean(patient.dateOfBirth)
        },
        insurance: {
          category: appt.category,
          hasHealthcareNumber: Boolean(patient.healthcareNumber)
        },
        now: this.now
      });
      if (!validation.ok) {
        const code: WorkflowFailureCode =
          validation.code === "DOUBLE_BOOKING" ? "DOUBLE_BOOKING" : "BOOKING_RULE";
        const e = err(code, validation.message);
        this.auditWrite(actor, "appointment.reschedule", "Appointment", appointmentId, false, e.code);
        this.assertUnchanged(before);
        return e;
      }
      appt.scheduledAt = opts.rescheduleTo;
    }

    appt.status = next;
    if (opts?.checkIn) {
      appt.checkedInAt = this.now.toISOString();
    }
    appt.version += 1;
    this.markIdempotent(opts?.idempotencyKey);
    this.auditWrite(actor, "appointment.status", "Appointment", appointmentId, true);
    return { ok: true, data: { ...appt }, stateChanged: true };
  }

  completeIntake(
    actor: WorkflowActor,
    patientId: string,
    progress: number
  ): WorkflowResultT<WorkflowPatient> {
    const before = snapshotJson(this);
    const permission: Permission =
      actor.role === "PATIENT" ? "appointment:update_own_status" : "patient:update_clinic";
    const blocked = this.gate(actor, permission);
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const patient = this.patients.get(patientId);
    if (!patient) {
      const e = err("MISSING_PATIENT_DATA", "Patient not found for intake");
      this.assertUnchanged(before);
      return e;
    }
    patient.prepProgress = Math.min(1, Math.max(0, progress));
    this.auditWrite(actor, "intake.complete", "Patient", patientId, true);
    return { ok: true, data: { ...patient }, stateChanged: true };
  }

  verifyIntake(
    actor: WorkflowActor,
    patientId: string
  ): WorkflowResultT<{ missing: string[]; ready: boolean }> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "patient:read_clinic");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const patient = this.patients.get(patientId);
    if (!patient) {
      const e = err("MISSING_PATIENT_DATA", "Patient not found");
      this.assertUnchanged(before);
      return e;
    }
    const missing: string[] = [];
    if (!patient.phone) missing.push("phone");
    if (!patient.healthcareNumber) missing.push("healthcareNumber");
    if (!patient.dateOfBirth) missing.push("dateOfBirth");
    if (patient.prepProgress < 0.5) missing.push("prepChecklist");
    return {
      ok: true,
      data: { missing, ready: missing.length === 0 },
      stateChanged: false
    };
  }

  startEncounter(actor: WorkflowActor, appointmentId: string): WorkflowResultT<WorkflowEncounter> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "clinical:read_chart_summary");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const appt = this.appointments.get(appointmentId);
    if (!appt || appt.status !== "CONFIRMED" || !appt.checkedInAt) {
      const e = err("INVALID_TRANSITION", "Encounter requires confirmed + checked-in visit");
      this.assertUnchanged(before);
      return e;
    }
    const encounter: WorkflowEncounter = {
      id: this.nextId("enc"),
      appointmentId,
      status: "in_progress",
      documentationAttested: false
    };
    this.encounters.set(encounter.id, encounter);
    this.auditWrite(actor, "encounter.start", "Encounter", encounter.id, true);
    return { ok: true, data: encounter, stateChanged: true };
  }

  draftDocumentation(
    actor: WorkflowActor,
    encounterId: string
  ): WorkflowResultT<{ draft: string; attested: false }> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "ai:use_clinical_assist");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const enc = this.encounters.get(encounterId);
    if (!enc || enc.status !== "in_progress") {
      const e = err("INVALID_TRANSITION", "Documentation draft requires in-progress encounter");
      this.assertUnchanged(before);
      return e;
    }
    assertAiAllowed("draft_note");
    const appt = this.appointments.get(enc.appointmentId)!;
    const patient = this.patients.get(appt.patientId)!;
    const generated = generateStubContent("draft_note", {
      subject: `${patient.firstName} ${patient.lastName}`,
      visitWhen: appt.scheduledAt,
      notes: appt.reason
    });
    enc.documentationDraft = generated.content;
    this.auditWrite(actor, "encounter.draft_note", "Encounter", encounterId, true);
    return { ok: true, data: { draft: generated.content, attested: false }, stateChanged: true };
  }

  attestDocumentation(
    actor: WorkflowActor,
    encounterId: string
  ): WorkflowResultT<WorkflowEncounter> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "ai:review");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const enc = this.encounters.get(encounterId);
    if (!enc?.documentationDraft) {
      const e = err("INVALID_TRANSITION", "Cannot attest without a draft");
      this.assertUnchanged(before);
      return e;
    }
    enc.documentationAttested = true;
    this.auditWrite(actor, "encounter.attest", "Encounter", encounterId, true);
    return { ok: true, data: { ...enc }, stateChanged: true };
  }

  placeOrder(
    actor: WorkflowActor,
    appointmentId: string,
    label: string
  ): WorkflowResultT<WorkflowOrder> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "clinical:read_chart_summary");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    if (this.integrationDown) {
      const e = err(
        "INTEGRATION_FAILURE",
        "External order SoR unavailable — no order recorded in HealthFlow"
      );
      this.auditWrite(actor, "order.place", "Order", "", false, e.code);
      this.assertUnchanged(before);
      return e;
    }
    const appt = this.appointments.get(appointmentId);
    const enc = [...this.encounters.values()].find((e) => e.appointmentId === appointmentId);
    if (!appt || !enc || enc.status !== "in_progress" || !enc.documentationAttested) {
      const e = err(
        "INVALID_TRANSITION",
        "Orders require an attested in-progress encounter (workflow coherence)"
      );
      this.assertUnchanged(before);
      return e;
    }
    const order: WorkflowOrder = {
      id: this.nextId("ord"),
      appointmentId,
      patientId: appt.patientId,
      label,
      status: "pending"
    };
    this.orders.set(order.id, order);
    this.auditWrite(actor, "order.place", "Order", order.id, true);
    return { ok: true, data: order, stateChanged: true };
  }

  finishEncounter(actor: WorkflowActor, encounterId: string): WorkflowResultT<WorkflowEncounter> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "appointment:update_own_schedule");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const enc = this.encounters.get(encounterId);
    if (!enc || enc.status !== "in_progress" || !enc.documentationAttested) {
      const e = err("INVALID_TRANSITION", "Finish requires attested documentation");
      this.assertUnchanged(before);
      return e;
    }
    enc.status = "finished";
    const appt = this.appointments.get(enc.appointmentId)!;
    appt.status = "COMPLETED";
    appt.version += 1;
    this.auditWrite(actor, "encounter.finish", "Encounter", encounterId, true);
    return { ok: true, data: { ...enc }, stateChanged: true };
  }

  ingestResult(
    actor: WorkflowActor,
    appointmentId: string,
    label: string,
    opts?: { external?: boolean }
  ): WorkflowResultT<WorkflowResult> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "appointment:update_clinic");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    if (this.integrationDown && opts?.external !== false) {
      const e = err(
        "INTEGRATION_FAILURE",
        "Lab/LIS integration failed — no fabricated result stored"
      );
      this.auditWrite(actor, "result.ingest", "Result", "", false, e.code);
      this.assertUnchanged(before);
      return e;
    }
    const appt = this.appointments.get(appointmentId);
    if (!appt || appt.status !== "COMPLETED") {
      const e = err("INVALID_TRANSITION", "Results attach after completed encounter");
      this.assertUnchanged(before);
      return e;
    }
    const result: WorkflowResult = {
      id: this.nextId("res"),
      patientId: appt.patientId,
      appointmentId,
      label,
      status: "ready_for_review",
      external: opts?.external ?? true
    };
    this.results.set(result.id, result);
    this.auditWrite(actor, "result.ingest", "Result", result.id, true);
    return { ok: true, data: result, stateChanged: true };
  }

  releaseResultToPatient(
    actor: WorkflowActor,
    resultId: string
  ): WorkflowResultT<WorkflowResult> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "message:reply");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    const result = this.results.get(resultId);
    if (!result || result.status !== "ready_for_review") {
      const e = err("INVALID_TRANSITION", "Result not ready for patient release");
      this.assertUnchanged(before);
      return e;
    }
    result.status = "released";
    this.addThread({
      status: "UNREAD",
      subject: `Result available: ${result.label}`,
      patientId: result.patientId
    });
    this.auditWrite(actor, "result.release", "Result", resultId, true);
    return { ok: true, data: { ...result }, stateChanged: true };
  }

  notifyPatient(
    actor: WorkflowActor,
    patientId: string,
    kind: "appointment_reminder" | "result_notification" | "follow_up_reminder",
    opts?: { alreadyNotifiedRecently?: boolean }
  ): WorkflowResultT<{ delivered: boolean; decision: NotificationDecision }> {
    const before = snapshotJson(this);
    const blocked = this.gate(actor, "reminder:manage_clinic");
    if (blocked) {
      this.assertUnchanged(before);
      return blocked;
    }
    if (this.notificationChannelDown) {
      const e = err(
        "NOTIFICATION_FAILURE",
        "Notification channel failed — appointment/care state was not altered"
      );
      this.auditWrite(actor, "notification.send", "Notification", patientId, false, e.code);
      this.assertUnchanged(before);
      return e;
    }
    const patient = this.patients.get(patientId);
    if (!patient) {
      const e = err("MISSING_PATIENT_DATA", "No patient for notification");
      this.assertUnchanged(before);
      return e;
    }
    const decision = decideNotification({
      kind,
      triggerEvent: `e2e:${kind}`,
      requiresAction: kind !== "result_notification",
      actionableAt: this.now,
      patientName: `${patient.firstName} ${patient.lastName}`,
      alreadyNotifiedRecently: opts?.alreadyNotifiedRecently,
      prefs: { email: true, sms: true, inApp: true, locale: "en-CA" },
      now: this.now
    });
    const delivered = decision.send === true;
    this.notifications.push({
      id: this.nextId("ntf"),
      decision,
      delivered
    });
    this.auditWrite(actor, "notification.send", "Notification", patientId, delivered);
    return { ok: true, data: { delivered, decision }, stateChanged: delivered };
  }

  patientNextStep(patientId: string): JourneyStepId {
    const patient = this.patients.get(patientId);
    const appts = [...this.appointments.values()]
      .filter((a) => a.patientId === patientId)
      .map((a) => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        reason: a.reason,
        category: a.category,
        checkedInAt: a.checkedInAt
      }));
    const threads = this.threads
      .filter((t) => t.patientId === patientId)
      .map((t) => ({ id: t.id, status: t.status }));
    return resolvePatientNextStep({
      isGuest: !patient?.registered,
      appointments: appts,
      threads,
      prepProgress: patient?.prepProgress ?? 0,
      now: this.now
    }).id;
  }

  frontDeskBoard() {
    const todayAppointments: OpsAppointment[] = [...this.appointments.values()].map((a) => {
      const p = this.patients.get(a.patientId);
      return {
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        reason: a.reason,
        category: a.category,
        profileId: a.patientId,
        doctorId: a.doctorId,
        checkedInAt: a.checkedInAt,
        patientName: p ? `${p.firstName} ${p.lastName}` : "Patient"
      };
    });
    return buildFrontDeskBoard({
      todayAppointments,
      threads: this.threads.map((t) => ({
        id: t.id,
        status: t.status,
        subject: t.subject,
        patientName: t.patientId
          ? `${this.patients.get(t.patientId)?.firstName ?? ""} ${this.patients.get(t.patientId)?.lastName ?? ""}`.trim()
          : undefined
      })),
      overdue: [],
      now: this.now
    });
  }

  clinicianBrief(doctorId: string, appointmentId: string) {
    const focus = this.appointments.get(appointmentId);
    if (!focus) return null;
    const patient = this.patients.get(focus.patientId);
    return buildClinicianBrief({
      focus: {
        id: focus.id,
        scheduledAt: focus.scheduledAt,
        status: focus.status,
        reason: focus.reason,
        category: focus.category,
        checkedInAt: focus.checkedInAt,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        profileId: focus.patientId,
        dateOfBirth: patient?.dateOfBirth,
        phone: patient?.phone,
        healthcareNumberMasked: patient?.healthcareNumber ? "••••" : null
      },
      todaySchedule: [...this.appointments.values()]
        .filter((a) => a.doctorId === doctorId)
        .map((a) => ({
          id: a.id,
          scheduledAt: a.scheduledAt,
          status: a.status,
          reason: a.reason,
          patientName: this.patients.get(a.patientId)
            ? `${this.patients.get(a.patientId)!.firstName} ${this.patients.get(a.patientId)!.lastName}`
            : undefined,
          profileId: a.patientId,
          checkedInAt: a.checkedInAt
        })),
      doctorProfileId: doctorId,
      now: this.now
    });
  }

  nextActionsFor(role: "PATIENT" | "RECEPTIONIST" | "DOCTOR") {
    return computeNextActions({
      role,
      now: this.now,
      appointments: [...this.appointments.values()].map((a) => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        reason: a.reason,
        category: a.category,
        profileId: a.patientId,
        doctorId: a.doctorId,
        checkedInAt: a.checkedInAt
      })),
      encounters: [...this.encounters.values()].map((e) => ({
        id: e.id,
        appointmentId: e.appointmentId,
        status: e.status
      })),
      orders: [...this.orders.values()].map((o) => ({
        id: o.id,
        status: o.status,
        label: o.label,
        patientProfileId: o.patientId
      })),
      results: [...this.results.values()].map((r) => ({
        id: r.id,
        status: r.status === "released" ? "released" : r.status,
        label: r.label,
        patientProfileId: r.patientId,
        external: r.external
      }))
    });
  }
}

export type JourneyPhaseTrace = { phase: string; detail: string };

function assertStep(actual: JourneyStepId, allowed: JourneyStepId[]): void {
  if (!allowed.includes(actual)) {
    throw new Error(`Unexpected patient step ${actual}; allowed ${allowed.join(",")}`);
  }
}

/** Patient: registration → appointment → intake → check-in → encounter → result → follow-up */
export function runPatientCareJourney(world: ClinicWorld): {
  phases: JourneyPhaseTrace[];
  appointmentId: string;
  patientId: string;
} {
  const orgId = "org-e2e";
  const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: orgId });
  const clinician = world.seedActor({ id: "doc-1", role: "DOCTOR", organizationId: orgId });
  const phases: JourneyPhaseTrace[] = [];

  const reg = world.registerPatient(reception, {
    firstName: "Alex",
    lastName: "Patient",
    email: "alex@example.com",
    phone: "+15555550100",
    healthcareNumber: "HCN-100",
    dateOfBirth: "1988-04-12",
    idempotencyKey: "reg-alex"
  });
  if (!reg.ok) throw new Error(reg.message);
  phases.push({ phase: "registration", detail: reg.data.id });

  const slot = nextWeekdaySlot(world.now, 10, 0);
  const book = world.bookAppointment(reception, {
    patientId: reg.data.id,
    doctorId: clinician.id,
    scheduledAt: slot,
    category: "CHECKUP",
    reason: "Annual checkup",
    idempotencyKey: "book-alex-1"
  });
  if (!book.ok) throw new Error(book.message);
  phases.push({ phase: "appointment", detail: book.data.id });

  const patientActor = world.seedActor({
    id: "patient-actor",
    role: "PATIENT",
    organizationId: orgId
  });
  const confirm = world.updateAppointmentStatus(patientActor, book.data.id, "CONFIRMED");
  if (!confirm.ok) throw new Error(confirm.message);
  assertStep(world.patientNextStep(reg.data.id), ["prep_visit", "day_of_arrive"]);

  const intake = world.completeIntake(patientActor, reg.data.id, 1);
  if (!intake.ok) throw new Error(intake.message);
  phases.push({ phase: "intake", detail: `prep=${intake.data.prepProgress}` });

  world.now = new Date(new Date(slot).getTime() - 60 * 60_000);
  assertStep(world.patientNextStep(reg.data.id), ["day_of_arrive", "prep_visit"]);

  const checkIn = world.updateAppointmentStatus(reception, book.data.id, "CONFIRMED", {
    checkIn: true
  });
  if (!checkIn.ok) throw new Error(checkIn.message);
  phases.push({ phase: "check-in", detail: checkIn.data.checkedInAt ?? "" });
  assertStep(world.patientNextStep(reg.data.id), ["checked_in"]);

  const enc = world.startEncounter(clinician, book.data.id);
  if (!enc.ok) throw new Error(enc.message);
  const draft = world.draftDocumentation(clinician, enc.data.id);
  if (!draft.ok) throw new Error(draft.message);
  const attest = world.attestDocumentation(clinician, enc.data.id);
  if (!attest.ok) throw new Error(attest.message);
  const finish = world.finishEncounter(clinician, enc.data.id);
  if (!finish.ok) throw new Error(finish.message);
  phases.push({ phase: "encounter", detail: finish.data.id });

  const result = world.ingestResult(reception, book.data.id, "CBC panel");
  if (!result.ok) throw new Error(result.message);
  const release = world.releaseResultToPatient(reception, result.data.id);
  if (!release.ok) throw new Error(release.message);
  phases.push({ phase: "result", detail: release.data.id });

  assertStep(world.patientNextStep(reg.data.id), ["open_messages", "follow_up"]);
  phases.push({ phase: "follow-up", detail: world.patientNextStep(reg.data.id) });

  return { phases, appointmentId: book.data.id, patientId: reg.data.id };
}

/** Receptionist: appointment → intake verification → arrival → handoff → reschedule → cancellation */
export function runReceptionistDeskJourney(world: ClinicWorld): JourneyPhaseTrace[] {
  const orgId = "org-desk";
  const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: orgId });
  const clinician = world.seedActor({ id: "doc-desk", role: "DOCTOR", organizationId: orgId });
  const phases: JourneyPhaseTrace[] = [];

  const reg = world.registerPatient(reception, {
    firstName: "Blair",
    lastName: "Visitor",
    email: "blair@example.com",
    phone: "+15555550200",
    healthcareNumber: "HCN-200",
    dateOfBirth: "1990-01-01"
  });
  if (!reg.ok) throw new Error(reg.message);

  const slot = nextWeekdaySlot(world.now, 11, 0);
  const book = world.bookAppointment(reception, {
    patientId: reg.data.id,
    doctorId: clinician.id,
    scheduledAt: slot,
    reason: "Follow-up"
  });
  if (!book.ok) throw new Error(book.message);
  phases.push({ phase: "appointment", detail: book.data.id });
  if (measureDeskWorkflowClicks("confirmVisit") !== 1) {
    throw new Error("Desk confirm path must remain 1-click");
  }

  world.completeIntake(reception, reg.data.id, 0.2);
  const verify = world.verifyIntake(reception, reg.data.id);
  if (!verify.ok) throw new Error(verify.message);
  phases.push({
    phase: "intake_verification",
    detail: verify.data.ready ? "ready" : verify.data.missing.join(",")
  });
  world.completeIntake(reception, reg.data.id, 1);

  world.now = new Date(new Date(slot).getTime() - 30 * 60_000);
  const arrive = world.updateAppointmentStatus(reception, book.data.id, "CONFIRMED", {
    checkIn: true
  });
  if (!arrive.ok) throw new Error(arrive.message);
  phases.push({ phase: "arrival", detail: "checked_in" });

  const board = world.frontDeskBoard();
  const laneCount = board.lanes.reduce((n, l) => n + l.items.length, 0);
  phases.push({
    phase: "provider_handoff",
    detail: `board_items=${laneCount};clicks=${measureDeskWorkflowClicks("checkIn")}`
  });

  const newSlot = nextWeekdaySlot(world.now, 15, 0);
  const request = world.updateAppointmentStatus(reception, book.data.id, "RESCHEDULE_REQUESTED");
  if (!request.ok) throw new Error(request.message);
  const reschedule = world.updateAppointmentStatus(reception, book.data.id, "SCHEDULED", {
    rescheduleTo: newSlot
  });
  if (!reschedule.ok) throw new Error(reschedule.message);
  phases.push({ phase: "reschedule", detail: newSlot });

  const cancel = world.updateAppointmentStatus(reception, book.data.id, "CANCELLED");
  if (!cancel.ok) throw new Error(cancel.message);
  phases.push({ phase: "cancellation", detail: cancel.data.status });

  return phases;
}

/** Clinician: schedule → patient prep → encounter → documentation → order → follow-up */
export function runClinicianJourney(world: ClinicWorld): JourneyPhaseTrace[] {
  const orgId = "org-md";
  const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: orgId });
  const clinician = world.seedActor({ id: "doc-md", role: "DOCTOR", organizationId: orgId });
  const phases: JourneyPhaseTrace[] = [];

  const reg = world.registerPatient(reception, {
    firstName: "Casey",
    lastName: "Member",
    email: "casey@example.com",
    phone: "+15555550300",
    healthcareNumber: "HCN-300",
    dateOfBirth: "1975-09-09"
  });
  if (!reg.ok) throw new Error(reg.message);

  const slot = nextWeekdaySlot(world.now, 9, 30);
  const book = world.bookAppointment(clinician, {
    patientId: reg.data.id,
    doctorId: clinician.id,
    scheduledAt: slot,
    category: "FOLLOW_UP",
    reason: "BP follow-up"
  });
  if (!book.ok) throw new Error(book.message);
  phases.push({ phase: "schedule", detail: book.data.id });

  world.updateAppointmentStatus(reception, book.data.id, "CONFIRMED", { checkIn: true });
  const brief = world.clinicianBrief(clinician.id, book.data.id);
  if (!brief?.appointmentId) throw new Error("missing clinician brief");
  phases.push({ phase: "patient_preparation", detail: brief.appointmentId });

  const enc = world.startEncounter(clinician, book.data.id);
  if (!enc.ok) throw new Error(enc.message);
  phases.push({ phase: "encounter", detail: enc.data.status });

  const draft = world.draftDocumentation(clinician, enc.data.id);
  if (!draft.ok) throw new Error(draft.message);
  const attest = world.attestDocumentation(clinician, enc.data.id);
  if (!attest.ok) throw new Error(attest.message);
  phases.push({ phase: "documentation", detail: "attested" });

  const order = world.placeOrder(clinician, book.data.id, "Basic metabolic panel");
  if (!order.ok) throw new Error(order.message);
  phases.push({ phase: "order", detail: order.data.id });

  const finish = world.finishEncounter(clinician, enc.data.id);
  if (!finish.ok) throw new Error(finish.message);

  world.addThread({
    status: "PENDING",
    subject: "Follow-up in 2 weeks",
    patientId: reg.data.id
  });
  const actions = world.nextActionsFor("DOCTOR");
  phases.push({
    phase: "follow-up",
    detail: `next_actions=${actions.length}`
  });

  return phases;
}

/** Next Mon–Fri slot at HH:MM (UTC used as clinic-local in harness). */
export function nextWeekdaySlot(from: Date, hour: number, minute: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    const day = d.getUTCDay();
    if (day >= 1 && day <= 5) {
      d.setUTCHours(hour, minute, 0, 0);
      if (d.getTime() > from.getTime()) return d.toISOString();
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error("Could not find weekday slot");
}

export function failureCodesCovered(): WorkflowFailureCode[] {
  return [
    "NETWORK_FAILURE",
    "DOUBLE_BOOKING",
    "INTEGRATION_FAILURE",
    "SESSION_EXPIRED",
    "UNAUTHORIZED",
    "MISSING_PATIENT_DATA",
    "NOTIFICATION_FAILURE",
    "DUPLICATE_REQUEST",
    "CONFLICTING_UPDATE"
  ];
}
