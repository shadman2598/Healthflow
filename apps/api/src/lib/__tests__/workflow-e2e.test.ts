import { describe, expect, it } from "vitest";
import {
  ClinicWorld,
  WORKFLOW_E2E_VERSION,
  failureCodesCovered,
  nextWeekdaySlot,
  runClinicianJourney,
  runPatientCareJourney,
  runReceptionistDeskJourney
} from "@technovate/shared";

/**
 * Prompt 46 — healthcare workflow end-to-end tests.
 * Complete journeys + failure coherence (no partial clinical writes).
 */

describe("healthcare workflow E2E (Prompt 46)", () => {
  it("tracks a stable harness version", () => {
    expect(WORKFLOW_E2E_VERSION).toMatch(/^hf-workflow-e2e-v/);
  });

  describe("patient journey", () => {
    it("runs registration → appointment → intake → check-in → encounter → result → follow-up", () => {
      const world = new ClinicWorld();
      const { phases, appointmentId, patientId } = runPatientCareJourney(world);

      expect(phases.map((p) => p.phase)).toEqual([
        "registration",
        "appointment",
        "intake",
        "check-in",
        "encounter",
        "result",
        "follow-up"
      ]);
      expect(world.appointments.get(appointmentId)?.status).toBe("COMPLETED");
      expect(world.patients.get(patientId)?.registered).toBe(true);
      expect([...world.results.values()].some((r) => r.status === "released")).toBe(true);
      expect(world.audit.some((a) => a.ok && a.action === "encounter.attest")).toBe(true);
    });
  });

  describe("receptionist journey", () => {
    it("runs appointment → intake verification → arrival → handoff → reschedule → cancellation", () => {
      const world = new ClinicWorld();
      const phases = runReceptionistDeskJourney(world);

      expect(phases.map((p) => p.phase)).toEqual([
        "appointment",
        "intake_verification",
        "arrival",
        "provider_handoff",
        "reschedule",
        "cancellation"
      ]);
      expect(phases.find((p) => p.phase === "intake_verification")?.detail).toContain("prepChecklist");
      const cancelled = [...world.appointments.values()].filter((a) => a.status === "CANCELLED");
      expect(cancelled).toHaveLength(1);
    });
  });

  describe("clinician journey", () => {
    it("runs schedule → prep → encounter → documentation → order → follow-up", () => {
      const world = new ClinicWorld();
      const phases = runClinicianJourney(world);

      expect(phases.map((p) => p.phase)).toEqual([
        "schedule",
        "patient_preparation",
        "encounter",
        "documentation",
        "order",
        "follow-up"
      ]);
      expect([...world.orders.values()]).toHaveLength(1);
      expect([...world.encounters.values()][0]?.documentationAttested).toBe(true);
      expect([...world.encounters.values()][0]?.status).toBe("finished");
    });
  });

  describe("failure conditions remain safe and coherent", () => {
    it("covers the required failure catalog", () => {
      expect(failureCodesCovered()).toEqual([
        "NETWORK_FAILURE",
        "DOUBLE_BOOKING",
        "INTEGRATION_FAILURE",
        "SESSION_EXPIRED",
        "UNAUTHORIZED",
        "MISSING_PATIENT_DATA",
        "NOTIFICATION_FAILURE",
        "DUPLICATE_REQUEST",
        "CONFLICTING_UPDATE"
      ]);
    });

    it("network failure does not mutate care state", () => {
      const world = new ClinicWorld({ networkDown: true });
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const before = world.captureSnapshot();
      const res = world.registerPatient(reception, {
        firstName: "No",
        lastName: "Net",
        email: "n@e.test",
        phone: "+15555550999",
        healthcareNumber: "HCN-X",
        dateOfBirth: "1991-01-01"
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("NETWORK_FAILURE");
        expect(res.stateUnchanged).toBe(true);
      }
      expect(world.captureSnapshot()).toBe(before);
      expect(world.patients.size).toBe(0);
    });

    it("duplicate booking is rejected without creating a second visit", () => {
      const world = new ClinicWorld();
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const doctor = world.seedActor({ id: "doc-dup", role: "DOCTOR", organizationId: "org" });
      const patient = world.registerPatient(reception, {
        firstName: "Dup",
        lastName: "Book",
        email: "dup@e.test",
        phone: "+15555550888",
        healthcareNumber: "HCN-D",
        dateOfBirth: "1992-02-02"
      });
      if (!patient.ok) throw new Error(patient.message);
      const slot = nextWeekdaySlot(world.now, 10, 0);
      const first = world.bookAppointment(reception, {
        patientId: patient.data.id,
        doctorId: doctor.id,
        scheduledAt: slot
      });
      expect(first.ok).toBe(true);
      const before = world.captureSnapshot();
      const second = world.bookAppointment(reception, {
        patientId: patient.data.id,
        doctorId: doctor.id,
        scheduledAt: slot
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.code).toBe("DOUBLE_BOOKING");
        expect(second.stateUnchanged).toBe(true);
      }
      expect(world.captureSnapshot()).toBe(before);
      expect(world.appointments.size).toBe(1);
    });

    it("integration failure does not invent orders or results", () => {
      const world = new ClinicWorld();
      const { appointmentId } = runPatientCareJourney(world);
      // Journey already completed; start a fresh encounter path on a new visit.
      const world2 = new ClinicWorld({ integrationDown: true });
      const reception = world2.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const doctor = world2.seedActor({ id: "doc-int", role: "DOCTOR", organizationId: "org" });
      const patient = world2.registerPatient(reception, {
        firstName: "Int",
        lastName: "Fail",
        email: "int@e.test",
        phone: "+15555550777",
        healthcareNumber: "HCN-I",
        dateOfBirth: "1993-03-03"
      });
      if (!patient.ok) throw new Error(patient.message);
      const book = world2.bookAppointment(reception, {
        patientId: patient.data.id,
        doctorId: doctor.id,
        scheduledAt: nextWeekdaySlot(world2.now, 10, 0)
      });
      if (!book.ok) throw new Error(book.message);
      world2.updateAppointmentStatus(reception, book.data.id, "CONFIRMED", { checkIn: true });
      const enc = world2.startEncounter(doctor, book.data.id);
      if (!enc.ok) throw new Error(enc.message);
      world2.draftDocumentation(doctor, enc.data.id);
      world2.attestDocumentation(doctor, enc.data.id);

      const beforeOrder = world2.captureSnapshot();
      const order = world2.placeOrder(doctor, book.data.id, "CMP");
      expect(order.ok).toBe(false);
      if (!order.ok) expect(order.code).toBe("INTEGRATION_FAILURE");
      expect(world2.captureSnapshot()).toBe(beforeOrder);
      expect(world2.orders.size).toBe(0);

      // Complete without order, then result ingest also blocked
      world2.finishEncounter(doctor, enc.data.id);
      const beforeResult = world2.captureSnapshot();
      const result = world2.ingestResult(reception, book.data.id, "Lab");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INTEGRATION_FAILURE");
      expect(world2.captureSnapshot()).toBe(beforeResult);
      expect(world2.results.size).toBe(0);
      expect(appointmentId).toBeTruthy();
    });

    it("expired session blocks mutations", () => {
      const world = new ClinicWorld({ now: new Date("2026-06-10T14:00:00.000Z") });
      const reception = world.seedActor({
        role: "RECEPTIONIST",
        organizationId: "org",
        sessionExpiresAt: "2026-06-10T13:00:00.000Z"
      });
      const before = world.captureSnapshot();
      const res = world.registerPatient(reception, {
        firstName: "Exp",
        lastName: "ired",
        email: "e@e.test",
        phone: "+15555550666",
        healthcareNumber: "HCN-E",
        dateOfBirth: "1994-04-04"
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("SESSION_EXPIRED");
      expect(world.captureSnapshot()).toBe(before);
    });

    it("unauthorized access is denied", () => {
      const world = new ClinicWorld();
      const patient = world.seedActor({ role: "PATIENT", organizationId: "org" });
      const before = world.captureSnapshot();
      const res = world.registerPatient(patient, {
        firstName: "No",
        lastName: "Auth",
        email: "a@e.test",
        phone: "+15555550555",
        healthcareNumber: "HCN-A",
        dateOfBirth: "1995-05-05"
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("UNAUTHORIZED");
      expect(world.captureSnapshot()).toBe(before);
    });

    it("missing patient data blocks unsafe registration/booking", () => {
      const world = new ClinicWorld();
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const before = world.captureSnapshot();
      const res = world.registerPatient(reception, {
        firstName: "Miss",
        lastName: "ing",
        email: "m@e.test"
        // no phone / HCN / DOB
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("MISSING_PATIENT_DATA");
      expect(world.captureSnapshot()).toBe(before);
    });

    it("notification failure does not alter appointments", () => {
      const world = new ClinicWorld({ notificationChannelDown: true });
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const doctor = world.seedActor({ id: "doc-n", role: "DOCTOR", organizationId: "org" });
      const patient = world.registerPatient(reception, {
        firstName: "Note",
        lastName: "Fail",
        email: "n@e.test",
        phone: "+15555550444",
        healthcareNumber: "HCN-N",
        dateOfBirth: "1996-06-06"
      });
      if (!patient.ok) throw new Error(patient.message);
      const book = world.bookAppointment(reception, {
        patientId: patient.data.id,
        doctorId: doctor.id,
        scheduledAt: nextWeekdaySlot(world.now, 10, 0)
      });
      if (!book.ok) throw new Error(book.message);
      const before = world.captureSnapshot();
      const ntf = world.notifyPatient(reception, patient.data.id, "appointment_reminder");
      expect(ntf.ok).toBe(false);
      if (!ntf.ok) expect(ntf.code).toBe("NOTIFICATION_FAILURE");
      expect(world.captureSnapshot()).toBe(before);
      expect(world.appointments.get(book.data.id)?.status).toBe("SCHEDULED");
    });

    it("duplicate requests are ignored after first success", () => {
      const world = new ClinicWorld();
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const first = world.registerPatient(reception, {
        firstName: "Idem",
        lastName: "potent",
        email: "i@e.test",
        phone: "+15555550333",
        healthcareNumber: "HCN-ID",
        dateOfBirth: "1997-07-07",
        idempotencyKey: "reg-once"
      });
      expect(first.ok).toBe(true);
      const before = world.captureSnapshot();
      const dup = world.registerPatient(reception, {
        firstName: "Idem",
        lastName: "potent",
        email: "i2@e.test",
        phone: "+15555550334",
        healthcareNumber: "HCN-ID2",
        dateOfBirth: "1997-07-07",
        idempotencyKey: "reg-once"
      });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.code).toBe("DUPLICATE_REQUEST");
      expect(world.captureSnapshot()).toBe(before);
      expect(world.patients.size).toBe(1);
    });

    it("conflicting updates refuse overwrite", () => {
      const world = new ClinicWorld();
      const reception = world.seedActor({ role: "RECEPTIONIST", organizationId: "org" });
      const doctor = world.seedActor({ id: "doc-c", role: "DOCTOR", organizationId: "org" });
      const patient = world.registerPatient(reception, {
        firstName: "Conflict",
        lastName: "Case",
        email: "c@e.test",
        phone: "+15555550222",
        healthcareNumber: "HCN-C",
        dateOfBirth: "1998-08-08"
      });
      if (!patient.ok) throw new Error(patient.message);
      const book = world.bookAppointment(reception, {
        patientId: patient.data.id,
        doctorId: doctor.id,
        scheduledAt: nextWeekdaySlot(world.now, 10, 0)
      });
      if (!book.ok) throw new Error(book.message);
      const ok = world.updateAppointmentStatus(reception, book.data.id, "CONFIRMED");
      expect(ok.ok).toBe(true);
      const before = world.captureSnapshot();
      const conflict = world.updateAppointmentStatus(reception, book.data.id, "CANCELLED", {
        expectedVersion: 1 // stale — confirm bumped to 2
      });
      expect(conflict.ok).toBe(false);
      if (!conflict.ok) expect(conflict.code).toBe("CONFLICTING_UPDATE");
      expect(world.captureSnapshot()).toBe(before);
      expect(world.appointments.get(book.data.id)?.status).toBe("CONFIRMED");
    });
  });
});
