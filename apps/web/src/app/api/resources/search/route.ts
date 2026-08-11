import { NextResponse } from "next/server";
import { z } from "zod";
import { searchNearbyResources } from "../../../../lib/nearby-resources";

const bodySchema = z.object({
  postalCode: z.string().min(3),
  category: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = bodySchema.parse(json);
    const result = await searchNearbyResources(body.postalCode, body.category);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to search nearby resources";
    const status = message.includes("postal code") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
