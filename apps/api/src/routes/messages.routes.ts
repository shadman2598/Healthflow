import { Router } from "express";
import {
  createMessageThreadSchema,
  idParamSchema,
  replyMessageSchema,
  updateThreadSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { assertCanAccessMessageThread } from "../lib/patient-access";
import { sanitizeText } from "../lib/sanitize";
import { writeAuditLog } from "../lib/audit";
import { rateLimit } from "../middleware/rate-limit";

export const messagesRouter = Router();

const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: "messages" });

messagesRouter.use(requireAuth, enrichAuth);

messagesRouter.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.activeOrganizationId;

    const where =
      req.auth!.role === "PATIENT"
        ? { organizationId: orgId, patientProfile: { userId: req.auth!.userId } }
        : req.auth!.role === "DOCTOR"
          ? {
              organizationId: orgId,
              OR: [
                { assignedDoctorId: req.auth!.doctorProfileId },
                { assignedDoctorId: null }
              ]
            }
          : { organizationId: orgId };

    const threads = await prisma.messageThread.findMany({
      where,
      include: {
        patientProfile: { select: { id: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ threads });
  })
);

messagesRouter.post(
  "/threads",
  messageLimiter,
  asyncHandler(async (req, res) => {
    const body = createMessageThreadSchema.parse(req.body);
    const orgId = req.auth!.activeOrganizationId;

    let patientProfileId = req.auth!.patientProfileId;
    if (req.auth!.role !== "PATIENT") {
      throw new AppError("Staff must reply on existing threads or use admin tools", 400);
    }
    if (!patientProfileId) throw new AppError("Patient profile not found", 404);

    const thread = await prisma.messageThread.create({
      data: {
        organizationId: orgId,
        patientProfileId,
        subject: sanitizeText(body.subject, 200),
        priority: body.priority,
        messages: {
          create: {
            senderId: req.auth!.userId,
            body: sanitizeText(body.body),
            isInternal: false
          }
        }
      },
      include: { messages: true, patientProfile: true }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "MESSAGE_SENT",
      targetType: "MessageThread",
      targetId: thread.id,
      ipAddress: req.ip
    });

    res.status(201).json({ thread });
  })
);

messagesRouter.get(
  "/threads/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const thread = await prisma.messageThread.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: {
        patientProfile: true,
        messages: {
          where: req.auth!.role === "PATIENT" ? { isInternal: false } : undefined,
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { id: true, email: true, role: true } } }
        }
      }
    });
    if (!thread) throw new AppError("Thread not found", 404);
    await assertCanAccessMessageThread(req.auth!, thread);

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "MESSAGE_READ",
      targetType: "MessageThread",
      targetId: id,
      ipAddress: req.ip
    });

    res.json({ thread });
  })
);

messagesRouter.post(
  "/threads/:id/reply",
  messageLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = replyMessageSchema.parse(req.body);

    const thread = await prisma.messageThread.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!thread) throw new AppError("Thread not found", 404);
    await assertCanAccessMessageThread(req.auth!, thread);
    if (req.auth!.role === "PATIENT" && body.isInternal) throw new AppError("Forbidden", 403);

    const message = await prisma.message.create({
      data: {
        threadId: id,
        senderId: req.auth!.userId,
        body: sanitizeText(body.body),
        isInternal: body.isInternal
      }
    });

    await prisma.messageThread.update({
      where: { id },
      data: {
        status: req.auth!.role === "PATIENT" ? "PENDING" : "READ",
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "MESSAGE_SENT",
      targetType: "Message",
      targetId: message.id,
      ipAddress: req.ip
    });

    res.status(201).json({ message });
  })
);

messagesRouter.patch(
  "/threads/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateThreadSchema.parse(req.body);

    const thread = await prisma.messageThread.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!thread) throw new AppError("Thread not found", 404);
    if (req.auth!.role === "PATIENT") throw new AppError("Forbidden", 403);
    await assertCanAccessMessageThread(req.auth!, thread);

    const updated = await prisma.messageThread.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
        assignedDoctorId: body.assignedDoctorId,
        archivedAt: body.status === "ARCHIVED" ? new Date() : undefined
      }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: body.status === "ARCHIVED" ? "MESSAGE_SENT" : "MESSAGE_READ",
      targetType: "MessageThread",
      targetId: id,
      ipAddress: req.ip,
      metadata: { status: body.status, assignedDoctorId: body.assignedDoctorId }
    });

    res.json({ thread: updated });
  })
);
