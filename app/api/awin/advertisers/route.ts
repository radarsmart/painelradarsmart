import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinAdvertisers } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const countryCode = req.nextUrl.searchParams.get("country") || "BR";
    const advertisers = await fetchAwinAdvertisers(countryCode);
    return NextResponse.json(advertisers, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar anunciantes da AWIN.",
      },
      { status: 500 },
    );
  }
}
