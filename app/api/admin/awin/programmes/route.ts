import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinProgrammes } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const relationship = String(req.nextUrl.searchParams.get("relationship") ?? "joined").trim();
    const countryCode = String(req.nextUrl.searchParams.get("countryCode") ?? "").trim().toUpperCase();
    const includeHidden = req.nextUrl.searchParams.get("includeHidden") === "true";
    const programmes = await fetchAwinProgrammes({
      relationship,
      countryCode,
      includeHidden,
    });

    return NextResponse.json({ ok: true, programmes });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        programmes: [],
        error:
          error instanceof Error ? error.message : "Falha ao consultar programas da AWIN.",
      },
      { status: 500 },
    );
  }
}
