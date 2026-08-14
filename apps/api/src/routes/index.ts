import { Router } from "express";
import { appointmentsRouter } from "./appointments.routes";
import { auditRouter } from "./audit.routes";
import { authRouter } from "./auth.routes";
import { messagesRouter } from "./messages.routes";
import { patientProfilesRouter } from "./patient-profiles.routes";
import { patientsRouter } from "./patients.routes";
import { reminderLogsRouter } from "./reminder-logs.routes";
import { reminderRulesRouter } from "./reminder-rules.routes";
import { resourcesRouter } from "./resources.routes";
import { remindersRouter } from "./reminders.routes";
import { analyticsRouter } from "./analytics.routes";
import { interopRouter } from "./interop.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "healthflow-api",
    checks: {
      api: "up",
      time: new Date().toISOString()
    }
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/patients", patientsRouter);
apiRouter.use("/patient-profiles", patientProfilesRouter);
apiRouter.use("/appointments", appointmentsRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/reminder-rules", reminderRulesRouter);
apiRouter.use("/reminder-logs", reminderLogsRouter);
apiRouter.use("/audit-logs", auditRouter);
apiRouter.use("/resources", resourcesRouter);
apiRouter.use("/reminders", remindersRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/interop", interopRouter);
