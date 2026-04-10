import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinProductFeedProducts } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = String(req.nextUrl.searchParams.get("q") ?? "").trim();
    const limit = Number(req.nextUrl.searchParams.get("limit") || "30");
    const products = await fetchAwinProductFeedProducts({ search, limit });

    return NextResponse.json({ ok: true, products });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        products: [],
        error:
          error instanceof Error ? error.message : "Falha ao consultar produtos do feed AWIN.",
      },
      { status: 500 },
    );
  }
}
