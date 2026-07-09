import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { redisConnection } from "../lib/redis";
import { processReminderLog } from "./reminder-engine";
import { REMINDER_QUEUE_NAME, type ReminderJobData } from "./queue";

async function bootstrap(): Promise<void> {
  await prisma.$connect();

  const worker = new Worker<ReminderJobData>(
    REMINDER_QUEUE_NAME,
    async (job) => {
      await processReminderLog(job.data.reminderLogId);
    },
    {
      connection: redisConnection as never,
      concurrency: 10
    }
  );

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[reminder-worker] completed job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`[reminder-worker] failed job ${job?.id}`, error);
  });

  // eslint-disable-next-line no-console
  console.log("[reminder-worker] started");
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
