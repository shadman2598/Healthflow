import { z } from "zod";

export * from "./api-schemas";
export * from "./rbac";
export * from "./patient-journey";
export * from "./next-action";
export * from "./front-desk-os";
export * from "./clinician-cockpit";
export * from "./fhir";
export * from "./interop";
export * from "./scheduling-engine";
export * from "./notification-intelligence";
export * from "./ai-safety";
export * from "./audit-trail";
export * from "./analytics";
export * from "./accessibility";
export * from "./workflow-e2e";
export * from "./product-positioning";
export * from "./provenance";

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
