import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_COVERAGE_REQUIREMENTS,
  AUDIT_FORBIDDEN_HTTP_METHODS,
  assertAuditCoverageComplete,
  assertAuditEventComplete,
  categorizeAuditAction,
  isAuditMutationMethod
} from "@technovate/shared";
import { assertAuditImmutable, refuseAuditMutation } from "../audit";
import { AppError } from "../../errors/app-error";
import { readFileSync } from "fs";
import { join } from "path";

describe("audit trail coverage (Prompt 43)", () => {
  it("includes every required sensitive-action category", () => {
    const result = assertAuditCoverageComplete(AUDIT_ACTIONS);
    expect(result.ok).toBe(true);

    const categories = new Set(AUDIT_COVERAGE_REQUIREMENTS.map((r) => r.category));
    for (const required of [
      "authentication",
      "record_access",
      "record_modification",
      "record_deletion",
      "permission_change",
      "data_export",
      "data_sharing",
      "ai",
      "clinical_order",
      "appointment",
      "administrative"
    ]) {
      expect(categories.has(required as never)).toBe(true);
    }
  });

  it("maps login, AI, export, and appointment actions to categories", () => {
    expect(categorizeAuditAction("LOGIN")).toBe("authentication");
    expect(categorizeAuditAction("LOGOUT")).toBe("authentication");
    expect(categorizeAuditAction("PATIENT_VIEWED")).toBe("record_access");
    expect(categorizeAuditAction("PATIENT_UPDATED")).toBe("record_modification");
    expect(categorizeAuditAction("PATIENT_DELETED")).toBe("record_deletion");
    expect(categorizeAuditAction("ROLE_CHANGED")).toBe("permission_change");
    expect(categorizeAuditAction("DATA_EXPORTED")).toBe("data_export");
    expect(categorizeAuditAction("DATA_SHARED")).toBe("data_sharing");
    expect(categorizeAuditAction("AI_GENERATED")).toBe("ai");
    expect(categorizeAuditAction("AI_REVIEWED")).toBe("ai");
    expect(categorizeAuditAction("PRESCRIPTION_BLOCKED")).toBe("clinical_order");
    expect(categorizeAuditAction("APPOINTMENT_CREATED")).toBe("appointment");
    expect(categorizeAuditAction("ADMIN_ACTION")).toBe("administrative");
  });

  it("requires actor, role, org, resource, action, timestamp, source shape", () => {
    const incomplete = assertAuditEventComplete({
      action: "LOGIN",
      organizationId: "org1"
    });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.missing).toEqual(expect.arrayContaining(["timestamp", "source"]));

    const complete = assertAuditEventComplete({
      actorId: "u1",
      actorRole: "ADMIN",
      organizationId: "org1",
      resourceType: "User",
      resourceId: "u1",
      action: "LOGIN",
      timestamp: new Date().toISOString(),
      source: "api:/auth/login",
      metadata: { email: "a@b.c" }
    });
    expect(complete.ok).toBe(true);
  });

  it("forbids mutation HTTP methods against audit APIs", () => {
    for (const method of AUDIT_FORBIDDEN_HTTP_METHODS) {
      expect(isAuditMutationMethod(method)).toBe(true);
      expect(() => assertAuditImmutable(method)).toThrow(AppError);
    }
    expect(isAuditMutationMethod("GET")).toBe(false);
  });

  it("refuseAuditMutation always rejects", async () => {
    await expect(refuseAuditMutation("any-id")).rejects.toMatchObject({
      statusCode: 405
    });
  });

  it("audit router only exposes read + explicit 405 mutation stubs", () => {
    const routeSource = readFileSync(
      join(__dirname, "../../routes/audit.routes.ts"),
      "utf8"
    );
    expect(routeSource).toMatch(/auditRouter\.get\(/);
    expect(routeSource).toMatch(/immutable/);
    expect(routeSource).toMatch(/refuseAuditMutation/);
    expect(routeSource).not.toMatch(/prisma\.auditLog\.(update|delete|updateMany|deleteMany)/);
  });

  it("clinical order coverage is workflow-only (no Rx SoR)", () => {
    const clinical = AUDIT_COVERAGE_REQUIREMENTS.find((r) => r.category === "clinical_order");
    expect(clinical?.workflowOnly).toBe(true);
    expect(clinical?.requiredActions).toContain("PRESCRIPTION_BLOCKED");
  });
});
