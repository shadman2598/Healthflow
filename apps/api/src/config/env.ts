import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Comma-separated extra browser origins (e.g. https://shadman2598.github.io for Pages). */
  EXTRA_CORS_ORIGINS: z.string().default(""),
  JWT_SECRET: z.string().min(12),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("technovate_token"),
  ACTIVE_ORG_COOKIE_NAME: z.string().default("technovate_active_org"),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  SENDGRID_API_KEY: emptyToUndefined(z.string()),
  SENDGRID_FROM_EMAIL: emptyToUndefined(z.string().email()),
  TWILIO_ACCOUNT_SID: emptyToUndefined(z.string()),
  TWILIO_AUTH_TOKEN: emptyToUndefined(z.string()),
  TWILIO_FROM_PHONE: emptyToUndefined(z.string()),
  REMINDER_SCAN_INTERVAL_MS: z.coerce.number().default(60000)
});

export const env = envSchema.parse(process.env);
