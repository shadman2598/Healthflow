import { describe, expect, it } from "vitest";
import {
  assertAiAllowed,
  applyEngagementTransition,
  applyHumanReview,
  AI_DEFAULT_MODEL_ID,
  AI_PROMPT_VERSION,
  assertWorkflowOnly,
  buildAiArtifactShell,
  buildClinicianBrief,
  buildFrontDeskBoard,
  buildReceptionActions,
  buildVisitPropagationBundle,
  capabilitiesByTier,
  classifyAiCapability,
  completeNextAction,
  computeNextActions,
  COCKPIT_PREP_SCAN_SECONDS,
  decideNotification,
  DESK_CLICK_BUDGETS,
  dismissNextAction,
  DUPLICATE_ENTRY_AUDIT,
  FORBIDDEN_NEXT_ACTION_KINDS,
  measureCockpitClicks,
  measureDeskWorkflowClicks,
  mergeCanonicalField,
  presentAiOutput,
  profileGapsFromAppointments,
  proposeEscalation,
  recordAiFailure,
  redactPhiForAiProcessing,
  restoreNextAction,
  toFhirAppointment,
  toFhirPatient
} from "@technovate/shared";
import { isInsideQuietHours } from "../scheduling";

describe("scheduling quiet hours", () => {
  it("detects overnight quiet windows", () => {
    const evening = new Date("2026-06-01T22:30:00");
    expect(isInsideQuietHours(evening, 21, 7)).toBe(true);
    const morning = new Date("2026-06-01T08:00:00");
    expect(isInsideQuietHours(morning, 21, 7)).toBe(false);
  });
});

describe("next-action reception board", () => {
  it("prioritizes reschedule and inbox work", () => {
    const actions = buildReceptionActions({
      todayAppointments: [
        {
          id: "a1",
          scheduledAt: new Date().toISOString(),
          status: "RESCHEDULE_REQUESTED",
          patientName: "Ada Lovelace"
        }
      ],
      threads: [{ id: "t1", status: "PENDING", subject: "Note request" }],
      overdue: []
    });
    expect(actions.some((a) => a.id.startsWith("reschedule-"))).toBe(true);
    expect(actions.some((a) => a.id === "inbox")).toBe(true);
    expect(actions.every((a) => a.engine === "NEXT_ACTION")).toBe(true);
    expect(actions.every((a) => a.reversible && a.reason && a.sources.length > 0)).toBe(true);
  });
});

describe("NEXT_ACTION engine (Prompt 41)", () => {
  const now = new Date("2026-06-01T15:00:00.000Z");

  it("never diagnoses or prescribes — workflow kinds only", () => {
    const actions = computeNextActions({
      role: "DOCTOR",
      now,
      appointments: [
        {
          id: "a1",
          scheduledAt: "2026-06-01T16:00:00.000Z",
          status: "CONFIRMED",
          patientName: "Ada",
          profileId: "p1"
        }
      ],
      medications: [
        {
          id: "m1",
          flag: "reconciliation_needed",
          label: "External med list",
          externalSoR: true,
          patientProfileId: "p1"
        }
      ],
      results: [
        {
          id: "r1",
          status: "ready_for_review",
          label: "Clinic-flagged result",
          external: true,
          patientProfileId: "p1"
        }
      ]
    });

    expect(actions.some((a) => a.kind === "review_result")).toBe(true);
    expect(actions.some((a) => a.kind === "review_clinician_task")).toBe(true);
    expect(actions.every((a) => !(FORBIDDEN_NEXT_ACTION_KINDS as readonly string[]).includes(a.kind))).toBe(
      true
    );
    for (const a of actions) {
      expect(a.reason).toBeTruthy();
      expect(a.sources.length).toBeGreaterThan(0);
      expect(a.role).toBeTruthy();
      expect(a.urgency).toBeTruthy();
      expect(a.status).toBe("suggested");
      expect(a.computedAt).toBeTruthy();
      expect(a.auditKey).toBeTruthy();
      expect(a.reversible).toBe(true);
      assertWorkflowOnly(a);
    }
  });

  it("covers intake, insurance, referral, follow-up, and contact workflows", () => {
    const actions = computeNextActions({
      role: "RECEPTIONIST",
      now,
      appointments: [
        {
          id: "a2",
          scheduledAt: "2026-06-01T15:30:00.000Z",
          status: "SCHEDULED",
          patientName: "Grace",
          profileId: "p2"
        }
      ],
      intakeGaps: [{ appointmentId: "a2", profileId: "p2", patientName: "Grace", missing: ["phone"] }],
      adminTasks: [
        { id: "ins1", kind: "verify_insurance", label: "Verify coverage for Grace", patientProfileId: "p2" },
        { id: "doc1", kind: "missing_document", label: "Obtain referral letter", patientProfileId: "p2" }
      ],
      referrals: [{ id: "ref1", status: "open", specialty: "Cardiology", profileId: "p2" }],
      followUps: [
        {
          id: "fu1",
          dueAt: "2026-05-01T00:00:00.000Z",
          label: "Schedule BP follow-up",
          assignedRole: "RECEPTIONIST",
          patientProfileId: "p2"
        }
      ],
      threads: []
    });

    expect(actions.some((a) => a.kind === "complete_intake")).toBe(true);
    expect(actions.some((a) => a.kind === "verify_insurance")).toBe(true);
    expect(actions.some((a) => a.kind === "obtain_missing_document")).toBe(true);
    expect(actions.some((a) => a.kind === "complete_referral")).toBe(true);
    expect(actions.some((a) => a.kind === "schedule_follow_up")).toBe(true);
  });

  it("supports reversible dismiss via key filtering", () => {
    const base = computeNextActions({
      role: "RECEPTIONIST",
      now,
      appointments: [
        {
          id: "a3",
          scheduledAt: "2026-06-01T15:10:00.000Z",
          status: "RESCHEDULE_REQUESTED",
          patientName: "Ada"
        }
      ],
      threads: []
    });
    const key = base.find((a) => a.kind === "reschedule_visit")!.auditKey;
    const filtered = computeNextActions({
      role: "RECEPTIONIST",
      now,
      appointments: [
        {
          id: "a3",
          scheduledAt: "2026-06-01T15:10:00.000Z",
          status: "RESCHEDULE_REQUESTED",
          patientName: "Ada"
        }
      ],
      threads: [],
      dismissedKeys: [key]
    });
    expect(filtered.some((a) => a.auditKey === key)).toBe(false);

    const dismissed = dismissNextAction(base.find((a) => a.auditKey === key)!);
    expect(dismissed.status).toBe("dismissed");
    expect(restoreNextAction(dismissed).status).toBe("suggested");
    expect(completeNextAction(dismissed).status).toBe("completed");
  });
});

describe("Front Desk OS board", () => {
  const now = new Date("2026-06-01T15:00:00.000Z");

  it("keeps common workflows to a 1-click primary path", () => {
    expect(measureDeskWorkflowClicks("checkIn")).toBe(1);
    expect(measureDeskWorkflowClicks("confirmVisit")).toBe(1);
    expect(measureDeskWorkflowClicks("openInbox")).toBe(1);
    expect(DESK_CLICK_BUDGETS.openReschedule).toBe(1);
  });

  it("segments arrivals, waiting, reschedule, cancellations, and providers", () => {
    const board = buildFrontDeskBoard({
      now,
      todayAppointments: [
        {
          id: "arrive1",
          scheduledAt: "2026-06-01T15:10:00.000Z",
          status: "CONFIRMED",
          patientName: "Arriving Soon",
          doctorId: "d1",
          doctorName: "Dr. Gray"
        },
        {
          id: "wait1",
          scheduledAt: "2026-06-01T14:00:00.000Z",
          status: "CONFIRMED",
          checkedInAt: "2026-06-01T13:55:00.000Z",
          patientName: "Already Here",
          profileId: "p1",
          doctorId: "d1"
        },
        {
          id: "res1",
          scheduledAt: "2026-06-01T16:00:00.000Z",
          status: "RESCHEDULE_REQUESTED",
          patientName: "Needs Slot"
        },
        {
          id: "can1",
          scheduledAt: "2026-06-01T11:00:00.000Z",
          status: "CANCELLED",
          patientName: "Cancelled",
          doctorId: "d1"
        }
      ],
      threads: [
        { id: "t1", status: "PENDING", subject: "Sick note request", patientName: "Pat" },
        { id: "t2", status: "UNREAD", subject: "Referral update for imaging", patientName: "Ref" }
      ],
      overdue: [{ id: "o1", firstName: "Over", lastName: "Due", daysOverdue: 120 }],
      doctors: [{ id: "d1", firstName: "Gray", lastName: "Gray" }],
      profileGaps: [
        {
          id: "p2",
          firstName: "Incomplete",
          lastName: "Chart",
          missingFields: ["phone", "healthcare number"]
        }
      ]
    });

    const byId = Object.fromEntries(board.lanes.map((l) => [l.id, l]));
    expect(byId.arrivals.items.some((i) => i.inlineAction === "check_in")).toBe(true);
    expect(byId.waiting.items).toHaveLength(1);
    expect(byId.reschedule.items[0]?.clicks).toBe(1);
    expect(byId.cancellations.items).toHaveLength(1);
    expect(byId.incomplete_intake.items.some((i) => i.href?.includes("/patients/"))).toBe(true);
    expect(byId.communications.items.length).toBeGreaterThan(0);
    expect(byId.referrals.items.some((i) => /referr/i.test(i.title) || i.id.startsWith("ref-"))).toBe(
      true
    );
    expect(byId.providers.items).toHaveLength(1);
    expect(byId.admin_tasks.items.some((i) => i.id.startsWith("od-"))).toBe(true);
    expect(board.summary.waiting).toBe(1);
  });

  it("derives intake gaps from appointment profiles", () => {
    const gaps = profileGapsFromAppointments([
      {
        profile: {
          id: "p1",
          firstName: "A",
          lastName: "B",
          phone: "",
          healthcareNumber: "HCN",
          dateOfBirth: null
        }
      }
    ]);
    expect(gaps[0]?.missingFields).toEqual(expect.arrayContaining(["phone", "date of birth"]));
  });
});

describe("FHIR mappers", () => {
  it("maps patient and appointment resources with check-in aware status", () => {
    const patient = toFhirPatient({
      id: "p1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555",
      healthcareNumber: "HCN1",
      dateOfBirth: "1815-12-10",
      organizationId: "org1"
    });
    expect(patient.resourceType).toBe("Patient");
    expect(patient.name?.[0]?.family).toBe("Lovelace");

    const booked = toFhirAppointment({
      id: "a1",
      status: "CONFIRMED",
      scheduledAt: "2026-06-01T15:00:00.000Z",
      reason: "Follow-up",
      profileId: "p1",
      doctorId: "d1",
      organizationId: "org1"
    });
    expect(booked.resourceType).toBe("Appointment");
    expect(booked.status).toBe("booked");

    const arrived = toFhirAppointment({
      id: "a1",
      status: "CONFIRMED",
      scheduledAt: "2026-06-01T15:00:00.000Z",
      checkedInAt: "2026-06-01T14:55:00.000Z",
      profileId: "p1",
      doctorId: "d1",
      organizationId: "org1"
    });
    expect(arrived.status).toBe("arrived");
  });
});

describe("AI safety policy", () => {
  it("allows admin drafting and blocks diagnosis", () => {
    expect(classifyAiCapability("draft_patient_reply")?.allowed).toBe(true);
    expect(() => assertAiAllowed("diagnose")).toThrow(/blocked/i);
    const artifact = buildAiArtifactShell("visit_brief", ["appointment:a1"]);
    expect(artifact.humanReviewRequired).toBe(true);
    expect(artifact.status).toBe("draft");
  });

  it("explicitly separates risk tiers and blocks high-risk clinical", () => {
    expect(capabilitiesByTier("LOW_RISK_ADMINISTRATIVE").some((c) => c.id === "classify_ticket")).toBe(
      true
    );
    expect(capabilitiesByTier("CLINICAL_ASSISTANCE").some((c) => c.id === "history_summary")).toBe(true);
    expect(capabilitiesByTier("HIGH_RISK_CLINICAL").every((c) => !c.allowed)).toBe(true);
    expect(() => assertAiAllowed("treatment_recommend")).toThrow(/blocked/i);
    expect(() => assertAiAllowed("prescribe")).toThrow(/blocked/i);
    expect(() => assertAiAllowed("emergency_triage")).toThrow(/blocked/i);
  });

  it("redacts PHI, tracks model/prompt versions, and never claims verified fact", () => {
    const { redacted, redactedFields } = redactPhiForAiProcessing(
      "Call 403-555-1212 or ada@example.com HCN 1234-567-890 DOB 1990-01-15"
    );
    expect(redacted).toContain("[PHONE_REDACTED]");
    expect(redacted).toContain("[EMAIL_REDACTED]");
    expect(redacted).toContain("[HCN_REDACTED]");
    expect(redacted).toContain("[DOB_REDACTED]");
    expect(redactedFields.length).toBeGreaterThanOrEqual(3);

    const shell = buildAiArtifactShell("draft_note", [{ ref: "appointment:a1", label: "Visit" }], {
      confidence: 0.4,
      phiRedacted: true
    });
    expect(shell.modelId).toBe(AI_DEFAULT_MODEL_ID);
    expect(shell.promptVersion).toBe(AI_PROMPT_VERSION);

    const presented = presentAiOutput(shell, "Draft note body");
    expect(presented.verifiedFact).toBe(false);
    expect(presented.requiresHumanReview).toBe(true);
    expect(presented.disclaimer).toMatch(/not verified/i);

    const reviewed = applyHumanReview(shell, "reviewed", "user-1", "Looks ok");
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.artifactVersion).toBe(shell.artifactVersion + 1);
    expect(presentAiOutput(reviewed, "Draft note body").verifiedFact).toBe(false);

    const blocked = recordAiFailure("diagnose", "POLICY_BLOCKED", "High-risk");
    expect(blocked.status).toBe("blocked");
  });
});

describe("Never-enter-twice provenance engine", () => {
  it("documents duplicate-entry audit targets", () => {
    expect(DUPLICATE_ENTRY_AUDIT.some((r) => r.field === "demographics")).toBe(true);
    expect(DUPLICATE_ENTRY_AUDIT.some((r) => r.canonical === "external_ehr")).toBe(true);
  });

  it("refuses silent overwrite of patient notes", () => {
    const conflict = mergeCanonicalField({
      fieldKey: "appointment.patientNotes",
      existing: "Home BP 138/88",
      proposed: "staff replaced this",
      actorRole: "RECEPTIONIST",
      resourceType: "Appointment",
      resourceId: "a1"
    });
    expect(conflict.action).toBe("conflict");
  });

  it("allows overwrite only when explicitly requested (audited path)", () => {
    const ok = mergeCanonicalField({
      fieldKey: "appointment.patientNotes",
      existing: "Home BP 138/88",
      proposed: "Corrected with patient consent",
      actorRole: "DOCTOR",
      resourceType: "Appointment",
      resourceId: "a1",
      allowOverwrite: true
    });
    expect(ok.action).toBe("accept");
    if (ok.action === "accept") {
      expect(ok.provenance.source).toBe("clinician_entered");
      expect(ok.nextValue).toMatch(/Corrected/);
    }
  });

  it("rejects inventing medications in HealthFlow", () => {
    const d = mergeCanonicalField({
      fieldKey: "clinical.medications",
      existing: null,
      proposed: "Metformin 500mg",
      actorRole: "DOCTOR",
      resourceType: "Appointment",
      resourceId: "a1"
    });
    expect(d.action).toBe("reject_external");
  });

  it("propagates visit context into a message draft without re-typing", () => {
    const bundle = buildVisitPropagationBundle({
      reason: "BP follow-up",
      patientNotes: "Home readings 138/88",
      scheduledAt: "2026-06-01T15:00:00.000Z",
      patientName: "Ada Lovelace"
    });
    expect(bundle.messageDraft).toMatch(/BP follow-up/);
    expect(bundle.messageDraft).toMatch(/138\/88/);
    expect(bundle.facts.some((f) => f.field === "appointment.reason")).toBe(true);
  });

  it("fills empty reason but keeps existing without overwrite flag", () => {
    const fill = mergeCanonicalField({
      fieldKey: "appointment.reason",
      existing: null,
      proposed: "Checkup",
      actorRole: "RECEPTIONIST",
      resourceType: "Appointment",
      resourceId: "a1"
    });
    expect(fill.action).toBe("accept");

    const keep = mergeCanonicalField({
      fieldKey: "appointment.reason",
      existing: "Checkup",
      proposed: "Different reason",
      actorRole: "RECEPTIONIST",
      resourceType: "Appointment",
      resourceId: "a1"
    });
    expect(keep.action).toBe("conflict");
  });
});

describe("Clinician cockpit brief", () => {
  it("keeps prep workflows to a 1-click primary path", () => {
    expect(measureCockpitClicks("openNextPatient")).toBe(1);
    expect(measureCockpitClicks("openRelatedMessage")).toBe(1);
    expect(measureCockpitClicks("draftFollowUp")).toBe(1);
    expect(COCKPIT_PREP_SCAN_SECONDS).toBeLessThanOrEqual(60);
  });

  it("answers who/why/changed/next without inventing meds or labs", () => {
    const brief = buildClinicianBrief({
      focus: {
        id: "a2",
        scheduledAt: "2026-06-01T15:00:00.000Z",
        status: "CONFIRMED",
        reason: "BP follow-up",
        category: "FOLLOW_UP",
        patientNotes: "Home readings 138/88",
        staffNotes: "Checked BP at desk",
        checkedInAt: "2026-06-01T14:50:00.000Z",
        patientName: "Ada Lovelace",
        profileId: "p1",
        dateOfBirth: "1815-12-10",
        phone: "555-0100"
      },
      todaySchedule: [
        {
          id: "a2",
          scheduledAt: "2026-06-01T15:00:00.000Z",
          status: "CONFIRMED",
          patientName: "Ada Lovelace",
          checkedInAt: "2026-06-01T14:50:00.000Z"
        },
        {
          id: "a3",
          scheduledAt: "2026-06-01T16:00:00.000Z",
          status: "SCHEDULED",
          patientName: "Next Patient"
        }
      ],
      priorVisits: [
        {
          id: "a1",
          scheduledAt: "2026-05-01T15:00:00.000Z",
          status: "COMPLETED",
          reason: "Annual checkup",
          category: "CHECKUP"
        }
      ],
      threads: [
        {
          id: "t1",
          status: "PENDING",
          subject: "Question about readings",
          patientProfileId: "p1"
        }
      ]
    });

    expect(brief.headline.who).toContain("Ada");
    expect(brief.headline.why).toMatch(/BP follow-up/i);
    expect(brief.headline.previously).toMatch(/checkup/i);
    expect(brief.headline.changed).toMatch(/shifted|Reason/i);
    expect(brief.sections.find((s) => s.id === "medications")?.facts[0]?.priority).toBe("external");
    expect(brief.sections.find((s) => s.id === "allergies")?.facts[0]?.value).toMatch(/Not in HealthFlow/i);
    expect(brief.sections.find((s) => s.id === "patient_reported")?.facts[0]?.value).toMatch(/138\/88/);
    expect(brief.sections.find((s) => s.id === "pending_tasks")?.facts[0]?.href).toContain("threadId=");
    expect(brief.nextActions.some((a) => a.clicks === 1)).toBe(true);
    expect(brief.schedule.some((s) => s.isFocus)).toBe(true);
  });
});

describe("notification intelligence (Prompt 39)", () => {
  const basePrefs = { email: true, sms: false, inApp: true, locale: "en-CA" };

  it("does not notify merely because an event occurred", () => {
    const decision = decideNotification({
      kind: "result_notification",
      triggerEvent: "lab_result_ingested",
      requiresAction: false,
      urgency: "low",
      prefs: basePrefs
    });
    expect(decision.send).toBe(false);
    if (!decision.send) expect(decision.code).toBe("NO_ACTION_NEEDED");
  });

  it("respects opt-out and quiet hours for non-critical", () => {
    const opted = decideNotification({
      kind: "appointment_reminder",
      triggerEvent: "appointment_upcoming",
      requiresAction: true,
      actionableAt: new Date(Date.now() + 24 * 3600_000),
      prefs: { ...basePrefs, optOut: true }
    });
    expect(opted.send).toBe(false);

    const quiet = decideNotification({
      kind: "follow_up_reminder",
      triggerEvent: "follow_up_due",
      requiresAction: true,
      prefs: { ...basePrefs, quietHoursStart: 21, quietHoursEnd: 7 },
      now: new Date("2026-06-01T22:00:00")
    });
    expect(quiet.send).toBe(false);
    if (!quiet.send) expect(quiet.code).toBe("QUIET_HOURS");
  });

  it("localizes actionable appointment reminders and selects channels", () => {
    const decision = decideNotification({
      kind: "appointment_reminder",
      triggerEvent: "appointment_upcoming",
      requiresAction: true,
      actionableAt: new Date(Date.now() + 24 * 3600_000),
      visitWhen: "June 2, 2026, 10:00 a.m.",
      prefs: { ...basePrefs, sms: true, locale: "fr_CA" },
      urgency: "high"
    });
    expect(decision.send).toBe(true);
    if (decision.send) {
      expect(decision.locale).toBe("fr_CA");
      expect(decision.title).toMatch(/Rappel/);
      expect(decision.requiresAction).toBe(true);
      expect(decision.channels).toContain("IN_APP");
      expect(decision.channels).toContain("SMS");
      expect(decision.escalateAfterMinutes).toBeGreaterThan(0);
    }
  });

  it("suppresses external clinical noise without actionable payload", () => {
    const decision = decideNotification({
      kind: "medication_reminder",
      triggerEvent: "ehr_med_tick",
      requiresAction: false,
      externalClinical: true,
      prefs: basePrefs,
      urgency: "normal"
    });
    expect(decision.send).toBe(false);
    if (!decision.send) expect(decision.code).toBe("EXTERNAL_SOR");
  });

  it("proposes escalation when unanswered action ages out", () => {
    const proposal = proposeEscalation({
      kind: "administrative_request",
      requiresAction: true,
      urgency: "normal",
      deliveredAt: new Date(Date.now() - 49 * 60 * 60_000),
      escalateAfterMinutes: 48 * 60
    });
    expect(proposal).not.toBeNull();
    expect(proposal?.urgency).toBe("high");
  });

  it("tracks engagement transitions without regression", () => {
    expect(applyEngagementTransition("delivered", "opened").ok).toBe(true);
    expect(applyEngagementTransition("opened", "acted_upon").ok).toBe(true);
    expect(applyEngagementTransition("acted_upon", "opened").ok).toBe(false);
  });

  it("uses engagement metrics to suppress low-relevance low-urgency", () => {
    const decision = decideNotification({
      kind: "medication_reminder",
      triggerEvent: "med_due",
      requiresAction: true,
      urgency: "low",
      prefs: basePrefs,
      engagement: { delivered: 20, opened: 0, actedUpon: 0, ignored: 10, dismissed: 10 }
    });
    expect(decision.send).toBe(false);
    if (!decision.send) expect(decision.code).toBe("LOW_RELEVANCE");
  });
});
