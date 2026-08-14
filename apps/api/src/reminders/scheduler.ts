import "dotenv/config";
import { env } from "../config/env";
import { runEscalationScan } from "../lib/notification-intelligence";
import { prisma } from "../lib/prisma";
import { scanAndEnqueueDueReminders } from "./reminder-engine";

const intervalMs = env.REMINDER_SCAN_INTERVAL_MS;
let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;

  try {
    const now = new Date();
    const count = await scanAndEnqueueDueReminders(now);
    const escalated = await runEscalationScan(now);
    // eslint-disable-next-line no-console
    console.log(`[reminder-scheduler] tick complete, enqueued=${count}, escalated=${escalated}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reminder-scheduler] tick failed", error);
  } finally {
    busy = false;
  }
}

async function bootstrap(): Promise<void> {
  await prisma.$connect();

  await tick();
  setInterval(() => {
    void tick();
  }, intervalMs);

  // eslint-disable-next-line no-console
  console.log(`[reminder-scheduler] started interval=${intervalMs}ms`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
