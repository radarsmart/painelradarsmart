import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinFeedList } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const feeds = await fetchAwinFeedList();
    return NextResponse.json({ ok: true, feeds });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        feeds: [],
        error:
          error instanceof Error ? error.message : "Falha ao consultar lista de feeds AWIN.",
      },
      { status: 500 },
    );
  }
}
