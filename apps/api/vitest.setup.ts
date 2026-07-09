import dotenv from "dotenv";

dotenv.config({ path: ".env" });

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/technovate_reminders?schema=public";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "super-secret-change-me";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
process.env.COOKIE_NAME = process.env.COOKIE_NAME ?? "technovate_token";
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE ?? "false";
process.env.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
process.env.SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "";
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
process.env.TWILIO_FROM_PHONE = process.env.TWILIO_FROM_PHONE ?? "";
process.env.REMINDER_SCAN_INTERVAL_MS = process.env.REMINDER_SCAN_INTERVAL_MS ?? "60000";
