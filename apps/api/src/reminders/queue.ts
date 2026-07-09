import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis";

export const REMINDER_QUEUE_NAME = "reminder-send-queue";

export type ReminderJobData = {
  reminderLogId: string;
};

export const reminderQueue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, {
  connection: redisConnection as never
});
