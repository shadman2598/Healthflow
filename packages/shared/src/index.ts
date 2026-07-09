import { z } from "zod";

export * from "./api-schemas";

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
