import { z } from "zod";

export * from "./api-schemas";
export * from "./rbac";
export * from "./patient-journey";
export * from "./next-action";
export * from "./fhir";
export * from "./ai-safety";
export * from "./analytics";
export * from "./provenance";

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
