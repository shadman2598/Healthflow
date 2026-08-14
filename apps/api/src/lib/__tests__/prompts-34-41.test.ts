import { describe, expect, it } from "vitest";
import {
  assertAiAllowed,
  buildAiArtifactShell,
  buildReceptionActions,
  classifyAiCapability,
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
  });
});

describe("FHIR mappers", () => {
  it("maps patient and appointment resources", () => {
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

    const appt = toFhirAppointment({
      id: "a1",
      status: "CONFIRMED",
      scheduledAt: "2026-06-01T15:00:00.000Z",
      reason: "Follow-up",
      profileId: "p1",
      doctorId: "d1",
      organizationId: "org1"
    });
    expect(appt.resourceType).toBe("Appointment");
    expect(appt.status).toBe("arrived");
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
});
