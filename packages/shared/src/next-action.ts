/**
 * Multi-role Next Best Action engine (Prompt 41).
 * Workflow actions only — never diagnosis or prescribing.
 */

export type NextActionRole = "PATIENT" | "RECEPTIONIST" | "DOCTOR" | "ADMIN";

export type NextActionUrgency = "critical" | "high" | "normal" | "low";

export type NextAction = {
  id: string;
  role: NextActionRole;
  title: string;
  reason: string;
  href: string;
  urgency: NextActionUrgency;
  source: string;
  /** ISO timestamp when computed */
  computedAt: string;
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
};

export type OpsThread = {
  id: string;
  status: string;
  subject: string;
  assignedDoctorId?: string | null;
  patientName?: string;
};

export type OpsOverdue = {
  id: string;
  firstName: string;
  lastName: string;
  daysOverdue: number;
};

export type ReceptionBoardInput = {
  todayAppointments: OpsAppointment[];
  threads: OpsThread[];
  overdue: OpsOverdue[];
  now?: Date;
};

export type ClinicianBoardInput = {
  todayAppointments: OpsAppointment[];
  threads: OpsThread[];
  doctorProfileId?: string | null;
  now?: Date;
};

function iso(d = new Date()): string {
  return d.toISOString();
}

export function buildReceptionActions(input: ReceptionBoardInput): NextAction[] {
  const now = input.now ?? new Date();
  const actions: NextAction[] = [];
  const at = iso(now);

  const reschedules = input.todayAppointments.filter((a) => a.status === "RESCHEDULE_REQUESTED");
  for (const a of reschedules.slice(0, 5)) {
    actions.push({
      id: `reschedule-${a.id}`,
      role: "RECEPTIONIST",
      title: `Reschedule ${a.patientName ?? "patient"}`,
      reason: "Patient requested a new time",
      href: "/calendar",
      urgency: "high",
      source: `appointment:${a.id}`,
      computedAt: at
    });
  }

  const unconfirmed = input.todayAppointments.filter((a) => a.status === "SCHEDULED");
  if (unconfirmed.length > 0) {
    actions.push({
      id: "confirm-wave",
      role: "RECEPTIONIST",
      title: `${unconfirmed.length} visit${unconfirmed.length === 1 ? "" : "s"} still unconfirmed`,
      reason: "Reduce no-shows by confirming attendance",
      href: "/calendar",
      urgency: "normal",
      source: "appointments:scheduled",
      computedAt: at
    });
  }

  const pendingMsgs = input.threads.filter((t) => t.status === "PENDING" || t.status === "UNREAD");
  if (pendingMsgs.length > 0) {
    actions.push({
      id: "inbox",
      role: "RECEPTIONIST",
      title: `${pendingMsgs.length} message${pendingMsgs.length === 1 ? "" : "s"} need a reply`,
      reason: "Patient/clinic communication waiting",
      href: "/messages",
      urgency: pendingMsgs.length > 5 ? "high" : "normal",
      source: "messages:pending",
      computedAt: at
    });
  }

  if (input.overdue.length > 0) {
    actions.push({
      id: "overdue",
      role: "RECEPTIONIST",
      title: `${input.overdue.length} overdue checkup${input.overdue.length === 1 ? "" : "s"}`,
      reason: "Patients past annual checkup window",
      href: "/overdue-checkups",
      urgency: "low",
      source: "checkups:overdue",
      computedAt: at
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "clear",
      role: "RECEPTIONIST",
      title: "Board looks clear",
      reason: "No urgent front-desk tasks right now",
      href: "/calendar",
      urgency: "low",
      source: "ops:idle",
      computedAt: at
    });
  }

  return actions;
}

export function buildClinicianActions(input: ClinicianBoardInput): NextAction[] {
  const now = input.now ?? new Date();
  const at = iso(now);
  const actions: NextAction[] = [];

  const upcoming = [...input.todayAppointments]
    .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const next = upcoming[0];
  if (next) {
    actions.push({
      id: `prep-${next.id}`,
      role: "DOCTOR",
      title: `Prep: ${next.patientName ?? "next patient"}`,
      reason: next.reason ?? next.category ?? "Upcoming encounter",
      href: `/doctor/cockpit?appointmentId=${next.id}`,
      urgency: "high",
      source: `appointment:${next.id}`,
      computedAt: at
    });
  }

  const inbox = input.threads.filter(
    (t) =>
      (t.status === "PENDING" || t.status === "UNREAD") &&
      (t.assignedDoctorId === input.doctorProfileId || !t.assignedDoctorId)
  );
  if (inbox.length > 0) {
    actions.push({
      id: "clinical-inbox",
      role: "DOCTOR",
      title: `${inbox.length} inbox item${inbox.length === 1 ? "" : "s"}`,
      reason: "Assigned or unassigned patient messages",
      href: "/messages",
      urgency: "normal",
      source: "messages:clinical",
      computedAt: at
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "clinician-clear",
      role: "DOCTOR",
      title: "No patients waiting",
      reason: "Review calendar or catch up on messages",
      href: "/calendar",
      urgency: "low",
      source: "ops:idle",
      computedAt: at
    });
  }

  return actions;
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
      } else if (a.status === "SCHEDULED") {
        nextActionLabel = "Confirm / check in";
        nextActionHref = `/calendar`;
      } else if (a.status === "CONFIRMED") {
        nextActionLabel = "Ready for clinician";
        nextActionHref = "/doctor/dashboard";
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
