import { Router } from "express";
import { resourceSearchSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { RESOURCE_CATEGORIES, searchNearbyResources } from "../lib/nearby-resources";

export { RESOURCE_CATEGORIES };

export const resourcesRouter = Router();

resourcesRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    res.json({ categories: RESOURCE_CATEGORIES });
  })
);

resourcesRouter.post(
  "/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = resourceSearchSchema.parse(req.body);
    const payload = await searchNearbyResources(body.postalCode, body.category);

    if (req.auth?.userId) {
      await prisma.resourceSearch.create({
        data: {
          userId: req.auth.userId,
          postalCode: body.postalCode,
          category: body.category,
          results: payload.results as object[]
        }
      });
    }

    res.json(payload);
  })
);

// Public categories for unauthenticated / guest clients
resourcesRouter.get(
  "/public/categories",
  asyncHandler(async (_req, res) => {
    res.json({ categories: RESOURCE_CATEGORIES });
  })
);

resourcesRouter.post(
  "/public/search",
  asyncHandler(async (req, res) => {
    const body = resourceSearchSchema.parse(req.body);
    const payload = await searchNearbyResources(body.postalCode, body.category);
    res.json(payload);
  })
);
