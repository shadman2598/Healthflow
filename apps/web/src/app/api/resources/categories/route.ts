import { NextResponse } from "next/server";
import { RESOURCE_CATEGORIES } from "../../../../lib/nearby-resources";

export async function GET() {
  return NextResponse.json({ categories: RESOURCE_CATEGORIES });
}
