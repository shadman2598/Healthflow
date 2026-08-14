/**
 * NEXT_ACTION — healthcare workflow intelligence (Prompt 41).
 *
 * Answers: "What needs to happen next for this patient, clinician, receptionist, or care workflow?"
 * Workflow actions only — never diagnosis or prescribing.
 * Recommendations are auditable and reversible (dismiss / restore / complete).
 */

export const NEXT_ACTION_ENGINE = "NEXT_ACTION" as const;
export const NEXT_ACTION_VERSION = "hf-next-action-v1";

export type NextActionRole = "PATIENT" | "RECEPTIONIST" | "DOCTOR" | "ADMIN" | "NURSE";

export type NextActionUrgency = "critical" | "high" | "normal" | "low";

export type NextActionStatus =
  | "suggested"
  | "accepted"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "superseded"
  | "reversed";

/** Workflow kinds only — clinical decision kinds are forbidden. */
export type NextActionKind =
  | "complete_intake"
  | "schedule_follow_up"
  | "review_result"
  | "contact_patient"
  | "complete_referral"
  | "verify_insurance"
  | "obtain_missing_document"
  | "remind_patient"
  | "review_clinician_task"
  | "confirm_visit"
  | "check_in"
  | "reschedule_visit"
  | "reply_message"
  | "prep_encounter"
  | "idle_clear";

export const FORBIDDEN_NEXT_ACTION_KINDS = [
  "diagnose",
  "prescribe",
  "treatment_plan",
  "triage_decision",
  "medication_change"
] as const;

export type NextActionSource = {
  /** Domain type contributing the signal. */
  type:
    | "appointment"
    | "intake"
    | "encounter"
    | "order"
    | "referral"
    | "result"
    | "medication"
    | "follow_up"
    | "message"
    | "admin_task"
    | "ops";
  id?: string;
  label?: string;
  /** Minimal factual snapshot for audit — not free-form clinical narrative. */
  facts?: Record<string, string | number | boolean | null>;
};

export type NextAction = {
  id: string;
  engine: typeof NEXT_ACTION_ENGINE;
  engineVersion: string;
  kind: NextActionKind;
  /** Responsible role for this recommendation. */
  role: NextActionRole;
  title: string;
  reason: string;
  href: string;
  urgency: NextActionUrgency;
  status: NextActionStatus;
  /** Structured source data (auditable). */
  sources: NextActionSource[];
  /** Primary source ref string (compat + quick filter). */
  source: string;
  /** ISO timestamp when computed. */
  computedAt: string;
  patientProfileId?: string;
  /** Stable key for dismiss/restore across recomputes. */
  auditKey: string;
  /** Always true — overrides can be reversed without deleting history. */
  reversible: true;
};

export type OpsAppointment = {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  category?: string;
  patientName?: string;
  profileId?: string | null;
  doctorId?: string | null;
  doctorName?: string;
  checkedInAt?: string | null;
};

export type OpsThread = {
  id: string;
  status: string;
  subject: string;
  assignedDoctorId?: string | null;
  patientName?: string;
  patientProfileId?: string | null;
};

export type OpsOverdue = {
  id: string;
  firstName: string;
  lastName: string;
  daysOverdue: number;
};

export type OpsIntakeGap = {
  appointmentId: string;
  profileId?: string | null;
  patientName?: string;
  missing: string[];
};

export type OpsEncounter = {
  id: string;
  appointmentId: string;
  status: "planned" | "in_progress" | "finished" | "unknown";
  patientName?: string;
  profileId?: string | null;
};

export type OpsOrder = {
  id: string;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  label: string;
  patientProfileId?: string | null;
};

export type OpsReferral = {
  id: string;
  status: "open" | "pending_docs" | "completed" | "cancelled";
  specialty?: string;
  patientName?: string;
  profileId?: string | null;
};

/** Results: HealthFlow may only know "ready for review" via clinic signal — not invent labs. */
export type OpsResult = {
  id: string;
  status: "ready_for_review" | "pending" | "released";
  label: string;
  patientProfileId?: string | null;
  /** True when SoR is external EHR/LIS. */
  external?: boolean;
};

/** Medication workflow flags only — never dosing/Rx decisions. */
export type OpsMedicationFlag = {
  id: string;
  flag: "reconciliation_needed" | "refill_admin_follow_up";
  label: string;
  patientProfileId?: string | null;
  externalSoR?: boolean;
};

export type OpsFollowUp = {
  id: string;
  dueAt: string;
  label: string;
  patientProfileId?: string | null;
  assignedRole?: NextActionRole;
};

export type OpsAdminTask = {
  id: string;
  kind: "verify_insurance" | "missing_document" | "other";
  label: string;
  patientProfileId?: string | null;
  patientName?: string;
};

export type NextActionEngineInput = {
  role: NextActionRole;
  now?: Date;
  appointments?: OpsAppointment[];
  threads?: OpsThread[];
  overdue?: OpsOverdue[];
  intakeGaps?: OpsIntakeGap[];
  encounters?: OpsEncounter[];
  orders?: OpsOrder[];
  referrals?: OpsReferral[];
  results?: OpsResult[];
  medications?: OpsMedicationFlag[];
  followUps?: OpsFollowUp[];
  adminTasks?: OpsAdminTask[];
  doctorProfileId?: string | null;
  patientProfileId?: string | null;
  /** auditKeys currently dismissed (reversible filter). */
  dismissedKeys?: string[];
  /** auditKeys marked completed. */
  completedKeys?: string[];
};

export type ReceptionBoardInput = {
  todayAppointments: OpsAppointment[];
  threads: OpsThread[];
  overdue: OpsOverdue[];
  now?: Date;
  intakeGaps?: OpsIntakeGap[];
  adminTasks?: OpsAdminTask[];
  dismissedKeys?: string[];
};

export type ClinicianBoardInput = {
  todayAppointments: OpsAppointment[];
  threads: OpsThread[];
  doctorProfileId?: string | null;
  now?: Date;
  results?: OpsResult[];
  followUps?: OpsFollowUp[];
  medications?: OpsMedicationFlag[];
  dismissedKeys?: string[];
};

function iso(d = new Date()): string {
  return d.toISOString();
}

function primarySource(sources: NextActionSource[]): string {
  const s = sources[0];
  if (!s) return "ops:unknown";
  return s.id ? `${s.type}:${s.id}` : `${s.type}:${s.label ?? "signal"}`;
}

function action(partial: {
  kind: NextActionKind;
  role: NextActionRole;
  title: string;
  reason: string;
  href: string;
  urgency: NextActionUrgency;
  sources: NextActionSource[];
  computedAt: string;
  patientProfileId?: string;
  auditKey: string;
  status?: NextActionStatus;
  legacyId?: string;
}): NextAction {
  if ((FORBIDDEN_NEXT_ACTION_KINDS as readonly string[]).includes(partial.kind)) {
    throw new Error(`NEXT_ACTION refused forbidden kind: ${partial.kind}`);
  }
  return {
    id: partial.legacyId ?? partial.auditKey,
    engine: NEXT_ACTION_ENGINE,
    engineVersion: NEXT_ACTION_VERSION,
    kind: partial.kind,
    role: partial.role,
    title: partial.title,
    reason: partial.reason,
    href: partial.href,
    urgency: partial.urgency,
    status: partial.status ?? "suggested",
    sources: partial.sources,
    source: primarySource(partial.sources),
    computedAt: partial.computedAt,
    patientProfileId: partial.patientProfileId,
    auditKey: partial.auditKey,
    reversible: true
  };
}

function applyOverrides(
  actions: NextAction[],
  dismissedKeys: string[] = [],
  completedKeys: string[] = []
): NextAction[] {
  const dismissed = new Set(dismissedKeys);
  const completed = new Set(completedKeys);
  return actions
    .map((a) => {
      if (completed.has(a.auditKey)) return { ...a, status: "completed" as const };
      if (dismissed.has(a.auditKey)) return { ...a, status: "dismissed" as const };
      return a;
    })
    .filter((a) => a.status !== "dismissed" && a.status !== "completed");
}

function urgencyRank(u: NextActionUrgency): number {
  return { critical: 0, high: 1, normal: 2, low: 3 }[u];
}

export function sortNextActions(actions: NextAction[]): NextAction[] {
  return [...actions].sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));
}

/** Assert recommendation is workflow-safe (no silent clinical decisions). */
export function assertWorkflowOnly(rec: NextAction): void {
  if ((FORBIDDEN_NEXT_ACTION_KINDS as readonly string[]).includes(rec.kind as string)) {
    throw new Error(`Illegal NEXT_ACTION kind: ${rec.kind}`);
  }
  if (!rec.reason?.trim()) throw new Error("NEXT_ACTION requires reason");
  if (!rec.sources?.length) throw new Error("NEXT_ACTION requires source data");
  if (!rec.role) throw new Error("NEXT_ACTION requires responsible role");
  if (!rec.urgency) throw new Error("NEXT_ACTION requires urgency");
  if (!rec.status) throw new Error("NEXT_ACTION requires status");
  if (!rec.computedAt) throw new Error("NEXT_ACTION requires timestamp");
  if (!rec.auditKey) throw new Error("NEXT_ACTION requires auditKey");
  if (!rec.reversible) throw new Error("NEXT_ACTION must be reversible");
}

/**
 * Core engine: derive workflow next-actions from clinic signals.
 * Does not call models and does not invent EHR/LIS payloads.
 */
export function computeNextActions(input: NextActionEngineInput): NextAction[] {
  const now = input.now ?? new Date();
  const at = iso(now);
  const role = input.role;
  const actions: NextAction[] = [];

  const appointments = input.appointments ?? [];
  const threads = input.threads ?? [];

  // —— Appointments / intake / encounter ——
  for (const a of appointments) {
    if (a.status === "RESCHEDULE_REQUESTED" && (role === "RECEPTIONIST" || role === "ADMIN")) {
      actions.push(
        action({
          kind: "reschedule_visit",
          role: "RECEPTIONIST",
          title: `Reschedule ${a.patientName ?? "patient"}`,
          reason: "Appointment state is RESCHEDULE_REQUESTED — find a new slot",
          href: `/calendar?appointmentId=${encodeURIComponent(a.id)}`,
          urgency: "high",
          sources: [
            {
              type: "appointment",
              id: a.id,
              label: a.patientName,
              facts: { status: a.status, scheduledAt: a.scheduledAt }
            }
          ],
          computedAt: at,
          patientProfileId: a.profileId ?? undefined,
          auditKey: `reschedule:${a.id}`,
          legacyId: `reschedule-${a.id}`
        })
      );
    }

    if (
      a.status === "SCHEDULED" &&
      (role === "PATIENT" || role === "RECEPTIONIST" || role === "ADMIN") &&
      (!input.patientProfileId || a.profileId === input.patientProfileId)
    ) {
      if (role === "PATIENT") {
        actions.push(
          action({
            kind: "confirm_visit",
            role: "PATIENT",
            title: "Confirm your upcoming visit",
            reason: "Visit is scheduled but not yet confirmed",
            href: `/patient/appointments?action=confirm&id=${encodeURIComponent(a.id)}`,
            urgency: "high",
            sources: [
              {
                type: "appointment",
                id: a.id,
                facts: { status: a.status, scheduledAt: a.scheduledAt }
              }
            ],
            computedAt: at,
            patientProfileId: a.profileId ?? undefined,
            auditKey: `confirm:${a.id}`
          })
        );
      }
    }
  }

  if (role === "RECEPTIONIST" || role === "ADMIN") {
    const needCheckIn = appointments.filter(
      (a) =>
        (a.status === "SCHEDULED" || a.status === "CONFIRMED") &&
        !a.checkedInAt &&
        !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status)
    );
    if (needCheckIn.length > 0) {
      actions.push(
        action({
          kind: "check_in",
          role: "RECEPTIONIST",
          title: `${needCheckIn.length} arrival${needCheckIn.length === 1 ? "" : "s"} to confirm or check in`,
          reason: "Appointment state shows patients still need arrival handling",
          href: "/receptionist/dashboard",
          urgency: "high",
          sources: needCheckIn.slice(0, 8).map((a) => ({
            type: "appointment" as const,
            id: a.id,
            label: a.patientName,
            facts: { status: a.status, checkedInAt: a.checkedInAt ?? null }
          })),
          computedAt: at,
          auditKey: "arrivals:wave",
          legacyId: "arrivals"
        })
      );
    }

    const unconfirmed = appointments.filter((a) => a.status === "SCHEDULED");
    if (unconfirmed.length > 0 && needCheckIn.length === 0) {
      actions.push(
        action({
          kind: "remind_patient",
          role: "RECEPTIONIST",
          title: `${unconfirmed.length} visit${unconfirmed.length === 1 ? "" : "s"} still unconfirmed`,
          reason: "Reduce no-shows by confirming attendance",
          href: "/receptionist/dashboard",
          urgency: "normal",
          sources: [
            {
              type: "appointment",
              label: "unconfirmed_wave",
              facts: { count: unconfirmed.length }
            }
          ],
          computedAt: at,
          auditKey: "confirm-wave",
          legacyId: "confirm-wave"
        })
      );
    }
  }

  for (const gap of input.intakeGaps ?? []) {
    if (!(role === "RECEPTIONIST" || role === "ADMIN" || role === "PATIENT" || role === "NURSE")) {
      continue;
    }
    if (role === "PATIENT" && input.patientProfileId && gap.profileId !== input.patientProfileId) {
      continue;
    }
    const responsible: NextActionRole = role === "PATIENT" ? "PATIENT" : "RECEPTIONIST";
    actions.push(
      action({
        kind: "complete_intake",
        role: responsible,
        title:
          role === "PATIENT"
            ? "Complete visit prep"
            : `Complete intake — ${gap.patientName ?? "patient"}`,
        reason: `Missing intake fields: ${gap.missing.join(", ") || "incomplete profile"}`,
        href:
          role === "PATIENT"
            ? `/patient/care-guide?tab=prep&appointmentId=${encodeURIComponent(gap.appointmentId)}`
            : `/patients/${gap.profileId ?? ""}`,
        urgency: "normal",
        sources: [
          {
            type: "intake",
            id: gap.appointmentId,
            facts: { missing: gap.missing.join("|"), appointmentId: gap.appointmentId }
          }
        ],
        computedAt: at,
        patientProfileId: gap.profileId ?? undefined,
        auditKey: `intake:${gap.appointmentId}`
      })
    );
  }

  for (const enc of input.encounters ?? []) {
    if (enc.status === "in_progress" && (role === "DOCTOR" || role === "NURSE")) {
      actions.push(
        action({
          kind: "prep_encounter",
          role: "DOCTOR",
          title: `Continue encounter — ${enc.patientName ?? "patient"}`,
          reason: "Encounter state is in progress",
          href: `/doctor/cockpit?appointmentId=${encodeURIComponent(enc.appointmentId)}`,
          urgency: "high",
          sources: [
            {
              type: "encounter",
              id: enc.id,
              facts: { status: enc.status, appointmentId: enc.appointmentId }
            }
          ],
          computedAt: at,
          patientProfileId: enc.profileId ?? undefined,
          auditKey: `encounter:${enc.id}`
        })
      );
    }
  }

  // —— Messages ——
  const pendingMsgs = threads.filter((t) => t.status === "PENDING" || t.status === "UNREAD");
  if (pendingMsgs.length > 0 && (role === "RECEPTIONIST" || role === "ADMIN")) {
    actions.push(
      action({
        kind: "reply_message",
        role: "RECEPTIONIST",
        title: `${pendingMsgs.length} message${pendingMsgs.length === 1 ? "" : "s"} need a reply`,
        reason: "Patient/clinic communication waiting",
        href: "/messages",
        urgency: pendingMsgs.length > 5 ? "high" : "normal",
        sources: pendingMsgs.slice(0, 5).map((t) => ({
          type: "message" as const,
          id: t.id,
          label: t.subject,
          facts: { status: t.status }
        })),
        computedAt: at,
        auditKey: "messages:pending",
        legacyId: "inbox"
      })
    );
  }

  if (role === "DOCTOR" || role === "NURSE") {
    const inbox = threads.filter(
      (t) =>
        (t.status === "PENDING" || t.status === "UNREAD") &&
        (t.assignedDoctorId === input.doctorProfileId || !t.assignedDoctorId)
    );
    if (inbox.length > 0) {
      actions.push(
        action({
          kind: "review_clinician_task",
          role: "DOCTOR",
          title: `${inbox.length} inbox item${inbox.length === 1 ? "" : "s"}`,
          reason: "Assigned or unassigned patient messages need clinician review",
          href: "/messages",
          urgency: "normal",
          sources: inbox.slice(0, 5).map((t) => ({
            type: "message" as const,
            id: t.id,
            label: t.subject,
            facts: { status: t.status, assignedDoctorId: t.assignedDoctorId ?? null }
          })),
          computedAt: at,
          auditKey: "messages:clinical",
          legacyId: "clinical-inbox"
        })
      );
    }

    for (const t of inbox.slice(0, 3)) {
      if (/referr/i.test(t.subject)) {
        actions.push(
          action({
            kind: "complete_referral",
            role: "DOCTOR",
            title: `Referral follow-up — ${t.patientName ?? "patient"}`,
            reason: "Message subject indicates an open referral workflow",
            href: `/messages?threadId=${encodeURIComponent(t.id)}`,
            urgency: "normal",
            sources: [{ type: "message", id: t.id, label: t.subject, facts: { proxy: "referral_subject" } }],
            computedAt: at,
            patientProfileId: t.patientProfileId ?? undefined,
            auditKey: `referral-msg:${t.id}`
          })
        );
      }
      if (/result|lab|imaging/i.test(t.subject)) {
        actions.push(
          action({
            kind: "review_result",
            role: "DOCTOR",
            title: `Review result message — ${t.patientName ?? "patient"}`,
            reason: "Clinic message indicates results awaiting review (not an invented lab value)",
            href: `/messages?threadId=${encodeURIComponent(t.id)}`,
            urgency: "high",
            sources: [{ type: "message", id: t.id, label: t.subject, facts: { proxy: "result_subject" } }],
            computedAt: at,
            patientProfileId: t.patientProfileId ?? undefined,
            auditKey: `result-msg:${t.id}`
          })
        );
      }
      if (/insurance|coverage|phn/i.test(t.subject) && (role === "DOCTOR" || role === "NURSE")) {
        // Clinician sees contact; front desk owns verify — still surface as contact if assigned.
        actions.push(
          action({
            kind: "contact_patient",
            role: "DOCTOR",
            title: `Respond on coverage question — ${t.patientName ?? "patient"}`,
            reason: "Patient message about coverage/admin needs a reply",
            href: `/messages?threadId=${encodeURIComponent(t.id)}`,
            urgency: "normal",
            sources: [{ type: "message", id: t.id, label: t.subject }],
            computedAt: at,
            auditKey: `contact:${t.id}`
          })
        );
      }
    }
  }

  // —— Referrals / results / orders / meds / follow-ups / admin (explicit inputs) ——
  for (const ref of input.referrals ?? []) {
    if (ref.status === "completed" || ref.status === "cancelled") continue;
    if (!(role === "RECEPTIONIST" || role === "ADMIN" || role === "DOCTOR" || role === "NURSE")) continue;
    actions.push(
      action({
        kind: "complete_referral",
        role: role === "DOCTOR" || role === "NURSE" ? "DOCTOR" : "RECEPTIONIST",
        title: `Complete referral${ref.specialty ? ` — ${ref.specialty}` : ""}`,
        reason: `Referral status is ${ref.status}`,
        href: ref.profileId ? `/patients/${ref.profileId}` : "/messages",
        urgency: ref.status === "pending_docs" ? "high" : "normal",
        sources: [
          {
            type: "referral",
            id: ref.id,
            label: ref.specialty,
            facts: { status: ref.status, patientName: ref.patientName ?? null }
          }
        ],
        computedAt: at,
        patientProfileId: ref.profileId ?? undefined,
        auditKey: `referral:${ref.id}`
      })
    );
  }

  for (const result of input.results ?? []) {
    if (result.status !== "ready_for_review") continue;
    if (!(role === "DOCTOR" || role === "NURSE")) continue;
    actions.push(
      action({
        kind: "review_result",
        role: "DOCTOR",
        title: `Review result — ${result.label}`,
        reason: result.external
          ? "External result flagged ready for review — open clinic channel; HealthFlow is not the lab SoR"
          : "Result marked ready for clinician review",
        href: "/messages",
        urgency: "high",
        sources: [
          {
            type: "result",
            id: result.id,
            label: result.label,
            facts: { status: result.status, external: result.external ?? false }
          }
        ],
        computedAt: at,
        patientProfileId: result.patientProfileId ?? undefined,
        auditKey: `result:${result.id}`
      })
    );
  }

  for (const order of input.orders ?? []) {
    if (order.status !== "pending" && order.status !== "scheduled") continue;
    if (!(role === "RECEPTIONIST" || role === "ADMIN" || role === "NURSE")) continue;
    actions.push(
      action({
        kind: "review_clinician_task",
        role: role === "NURSE" ? "NURSE" : "RECEPTIONIST",
        title: `Advance order — ${order.label}`,
        reason: `Order workflow status is ${order.status}`,
        href: "/receptionist/dashboard",
        urgency: "normal",
        sources: [{ type: "order", id: order.id, label: order.label, facts: { status: order.status } }],
        computedAt: at,
        patientProfileId: order.patientProfileId ?? undefined,
        auditKey: `order:${order.id}`
      })
    );
  }

  for (const med of input.medications ?? []) {
    // Workflow only: reconciliation / admin follow-up — never prescribe or change therapy.
    if (!(role === "DOCTOR" || role === "NURSE")) continue;
    actions.push(
      action({
        kind: "review_clinician_task",
        role: "DOCTOR",
        title:
          med.flag === "reconciliation_needed"
            ? `Reconcile medication list — ${med.label}`
            : `Admin follow-up on medication request — ${med.label}`,
        reason: med.externalSoR
          ? "External medication SoR flagged a workflow task — do not invent Rx changes in HealthFlow"
          : "Medication workflow flag requires clinician/admin follow-up (not a prescribing decision)",
        href: "/doctor/cockpit",
        urgency: "normal",
        sources: [
          {
            type: "medication",
            id: med.id,
            label: med.label,
            facts: { flag: med.flag, externalSoR: med.externalSoR ?? false }
          }
        ],
        computedAt: at,
        patientProfileId: med.patientProfileId ?? undefined,
        auditKey: `med-flag:${med.id}`
      })
    );
  }

  for (const fu of input.followUps ?? []) {
    const due = new Date(fu.dueAt).getTime();
    if (Number.isNaN(due)) continue;
    const overdue = due <= now.getTime();
    const assigned = fu.assignedRole ?? "DOCTOR";
    if (role !== assigned && role !== "ADMIN") continue;
    actions.push(
      action({
        kind: "schedule_follow_up",
        role: assigned,
        title: fu.label,
        reason: overdue ? "Follow-up is due or overdue" : "Follow-up requirement upcoming",
        href: "/calendar",
        urgency: overdue ? "high" : "normal",
        sources: [
          {
            type: "follow_up",
            id: fu.id,
            label: fu.label,
            facts: { dueAt: fu.dueAt, overdue }
          }
        ],
        computedAt: at,
        patientProfileId: fu.patientProfileId ?? undefined,
        auditKey: `followup:${fu.id}`
      })
    );
  }

  for (const task of input.adminTasks ?? []) {
    if (!(role === "RECEPTIONIST" || role === "ADMIN")) continue;
    const kind: NextActionKind =
      task.kind === "verify_insurance"
        ? "verify_insurance"
        : task.kind === "missing_document"
          ? "obtain_missing_document"
          : "contact_patient";
    actions.push(
      action({
        kind,
        role: "RECEPTIONIST",
        title: task.label,
        reason:
          task.kind === "verify_insurance"
            ? "Administrative insurance verification outstanding"
            : task.kind === "missing_document"
              ? "Missing document blocks care workflow"
              : "Administrative task outstanding",
        href: task.patientProfileId ? `/patients/${task.patientProfileId}` : "/receptionist/dashboard",
        urgency: task.kind === "missing_document" ? "high" : "normal",
        sources: [
          {
            type: "admin_task",
            id: task.id,
            label: task.label,
            facts: { kind: task.kind, patientName: task.patientName ?? null }
          }
        ],
        computedAt: at,
        patientProfileId: task.patientProfileId ?? undefined,
        auditKey: `admin:${task.id}`
      })
    );
  }

  if ((role === "RECEPTIONIST" || role === "ADMIN") && (input.overdue?.length ?? 0) > 0) {
    actions.push(
      action({
        kind: "remind_patient",
        role: "RECEPTIONIST",
        title: `${input.overdue!.length} overdue checkup${input.overdue!.length === 1 ? "" : "s"}`,
        reason: "Patients past annual checkup window",
        href: "/overdue-checkups",
        urgency: "low",
        sources: input.overdue!.slice(0, 5).map((o) => ({
          type: "follow_up" as const,
          id: o.id,
          label: `${o.firstName} ${o.lastName}`,
          facts: { daysOverdue: o.daysOverdue }
        })),
        computedAt: at,
        auditKey: "checkups:overdue",
        legacyId: "overdue"
      })
    );
  }

  // Clinician prep for next visit
  if (role === "DOCTOR" || role === "NURSE") {
    const upcoming = [...appointments]
      .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    const next = upcoming[0];
    if (next) {
      actions.push(
        action({
          kind: "prep_encounter",
          role: "DOCTOR",
          title: `Prep: ${next.patientName ?? "next patient"}`,
          reason: next.reason ?? next.category ?? "Upcoming encounter needs prep",
          href: `/doctor/cockpit?appointmentId=${encodeURIComponent(next.id)}`,
          urgency: "high",
          sources: [
            {
              type: "appointment",
              id: next.id,
              label: next.patientName,
              facts: { status: next.status, scheduledAt: next.scheduledAt }
            }
          ],
          computedAt: at,
          patientProfileId: next.profileId ?? undefined,
          auditKey: `prep:${next.id}`,
          legacyId: `prep-${next.id}`
        })
      );
    }
  }

  let filtered = applyOverrides(actions, input.dismissedKeys, input.completedKeys);
  filtered = sortNextActions(filtered);

  // Dedupe by auditKey
  const seen = new Set<string>();
  filtered = filtered.filter((a) => {
    if (seen.has(a.auditKey)) return false;
    seen.add(a.auditKey);
    return true;
  });

  if (filtered.length === 0) {
    filtered.push(
      action({
        kind: "idle_clear",
        role,
        title: role === "DOCTOR" ? "No patients waiting" : "Board looks clear",
        reason: "No urgent workflow tasks from current signals",
        href: role === "PATIENT" ? "/patient/dashboard" : "/calendar",
        urgency: "low",
        sources: [{ type: "ops", label: "idle", facts: { role } }],
        computedAt: at,
        auditKey: `idle:${role}`,
        legacyId: role === "DOCTOR" ? "clinician-clear" : "clear"
      })
    );
  }

  for (const a of filtered) assertWorkflowOnly(a);
  return filtered;
}

/** @deprecated Prefer computeNextActions — kept for Front Desk OS compat. */
export function buildReceptionActions(input: ReceptionBoardInput): NextAction[] {
  return computeNextActions({
    role: "RECEPTIONIST",
    now: input.now,
    appointments: input.todayAppointments,
    threads: input.threads,
    overdue: input.overdue,
    intakeGaps: input.intakeGaps,
    adminTasks: input.adminTasks,
    dismissedKeys: input.dismissedKeys
  });
}

/** @deprecated Prefer computeNextActions — kept for clinician board compat. */
export function buildClinicianActions(input: ClinicianBoardInput): NextAction[] {
  return computeNextActions({
    role: "DOCTOR",
    now: input.now,
    appointments: input.todayAppointments,
    threads: input.threads,
    doctorProfileId: input.doctorProfileId,
    results: input.results,
    followUps: input.followUps,
    medications: input.medications,
    dismissedKeys: input.dismissedKeys
  });
}

/** Reversible lifecycle helpers (pure). */
export function dismissNextAction(rec: NextAction, at = new Date()): NextAction {
  return { ...rec, status: "dismissed", computedAt: rec.computedAt, /* keep original compute time */ };
}

export function restoreNextAction(rec: NextAction): NextAction {
  return { ...rec, status: "suggested" };
}

export function completeNextAction(rec: NextAction): NextAction {
  return { ...rec, status: "completed" };
}

export type ReceptionQueueItem = {
  appointmentId: string;
  time: string;
  patientName: string;
  reason: string;
  status: string;
  nextActionLabel: string;
  nextActionHref: string;
};

export function buildReceptionQueue(appointments: OpsAppointment[]): ReceptionQueueItem[] {
  return [...appointments]
    .filter((a) => !["CANCELLED"].includes(a.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .map((a) => {
      let nextActionLabel = "Open calendar";
      let nextActionHref = "/calendar";
      if (a.status === "RESCHEDULE_REQUESTED") {
        nextActionLabel = "Find new slot";
        nextActionHref = `/calendar?appointmentId=${encodeURIComponent(a.id)}`;
      } else if (a.checkedInAt) {
        nextActionLabel = "Waiting — open chart";
        nextActionHref = a.profileId ? `/patients/${a.profileId}` : "/patients";
      } else if (a.status === "SCHEDULED") {
        nextActionLabel = "Confirm / check in";
        nextActionHref = "/receptionist/dashboard";
      } else if (a.status === "CONFIRMED") {
        nextActionLabel = "Check in on arrival";
        nextActionHref = "/receptionist/dashboard";
      } else if (a.status === "COMPLETED") {
        nextActionLabel = "Done";
      }
      return {
        appointmentId: a.id,
        time: a.scheduledAt,
        patientName: a.patientName ?? "Patient",
        reason: a.reason ?? a.category?.replace(/_/g, " ") ?? "Visit",
        status: a.status,
        nextActionLabel,
        nextActionHref
      };
    });
}
