import { Router } from "express";
import {
  drugLabelsQuerySchema,
  holidaysQuerySchema,
  resourceSearchSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { rateLimit } from "../middleware/rate-limit";
import { RESOURCE_CATEGORIES, searchNearbyResources } from "../lib/nearby-resources";
import { fetchCanadianHolidays } from "../lib/public-holidays";
import { searchOpenFdaDrugLabels } from "../lib/openfda-labels";
import { AppError } from "../errors/app-error";

export { RESOURCE_CATEGORIES };

export const resourcesRouter = Router();

const publicLookupLimiter = rateLimit({ windowMs: 60_000, max: 40, keyPrefix: "resources-public-api" });

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

resourcesRouter.get(
  "/holidays",
  requireAuth,
  enrichAuth,
  publicLookupLimiter,
  asyncHandler(async (req, res) => {
    const parsed = holidaysQuerySchema.parse(req.query);
    const year = parsed.year ?? new Date().getFullYear();
    const payload = await fetchCanadianHolidays(year);
    res.json(payload);
  })
);

resourcesRouter.get(
  "/drug-labels",
  requireAuth,
  enrichAuth,
  publicLookupLimiter,
  asyncHandler(async (req, res) => {
    const parsed = drugLabelsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError("Query q is required (min 2 characters)", 400);
    }
    const payload = await searchOpenFdaDrugLabels(parsed.data.q);
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
