import { Router } from "express";
import { resourceSearchSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";

export const RESOURCE_CATEGORIES = [
  "Dentist",
  "Chiropractor",
  "Massage therapy",
  "Physiotherapy",
  "Pharmacy",
  "Walk-in clinic",
  "Laboratory",
  "Imaging/x-ray",
  "Mental health support",
  "Specialist referral resources",
  "Prescription-related resources"
] as const;

const MOCK_RESOURCES: Record<string, { name: string; address: string; phone: string; distance: string; website: string }[]> = {
  Dentist: [{ name: "Bright Smile Dental", address: "120 Main St", phone: "555-0101", distance: "1.2 km", website: "https://example.com" }],
  Chiropractor: [{ name: "Align Chiropractic", address: "55 Spine Ave", phone: "555-0110", distance: "2.0 km", website: "https://example.com" }],
  "Massage therapy": [{ name: "Relax Massage Studio", address: "18 Wellness Ln", phone: "555-0111", distance: "1.5 km", website: "https://example.com" }],
  Physiotherapy: [{ name: "Active Recovery PT", address: "90 Health Blvd", phone: "555-0112", distance: "2.8 km", website: "https://example.com" }],
  Pharmacy: [{ name: "HealthPlus Pharmacy", address: "88 Oak Ave", phone: "555-0102", distance: "0.8 km", website: "https://example.com" }],
  "Walk-in clinic": [{ name: "City Walk-In Clinic", address: "45 River Rd", phone: "555-0103", distance: "2.1 km", website: "https://example.com" }],
  Laboratory: [{ name: "Metro Lab Services", address: "200 Test St", phone: "555-0113", distance: "3.2 km", website: "https://example.com" }],
  "Imaging/x-ray": [{ name: "ClearView Imaging", address: "77 Scan Way", phone: "555-0114", distance: "4.0 km", website: "https://example.com" }],
  "Mental health support": [{ name: "MindWell Counselling", address: "12 Hope St", phone: "555-0115", distance: "1.9 km", website: "https://example.com" }],
  "Specialist referral resources": [{ name: "Regional Specialist Network", address: "300 Referral Dr", phone: "555-0116", distance: "5.5 km", website: "https://example.com" }],
  "Prescription-related resources": [{ name: "Rx Assist Program", address: "Near postal code", phone: "555-0117", distance: "2.4 km", website: "https://example.com" }]
};

export const resourcesRouter = Router();

resourcesRouter.use(requireAuth);

resourcesRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    res.json({ categories: RESOURCE_CATEGORIES });
  })
);

resourcesRouter.post(
  "/search",
  asyncHandler(async (req, res) => {
    const body = resourceSearchSchema.parse(req.body);
    const results = MOCK_RESOURCES[body.category] ?? [
      {
        name: `${body.category} — Sample Provider`,
        address: `Near ${body.postalCode}`,
        phone: "555-0199",
        distance: "3.5 km",
        website: "https://example.com"
      }
    ];

    await prisma.resourceSearch.create({
      data: {
        userId: req.auth!.userId,
        postalCode: body.postalCode,
        category: body.category,
        results
      }
    });

    res.json({
      results,
      disclaimer:
        "This tool helps users find nearby resources but does not recommend or endorse a provider.",
      integrationNote: "Future: Google Maps API or location services integration placeholder."
    });
  })
);
