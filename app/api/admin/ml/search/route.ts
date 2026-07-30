import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { searchViaMlSession } from "@/lib/scraping/ml-session-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  const query = String(req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20") || 20, 50);

  if (!query) {
    return NextResponse.json({ error: "Parametro q obrigatorio." }, { status: 400 });
  }

  try {
    const items = await searchViaMlSession(query, limit);
    return NextResponse.json({
      products: items,
      source: "ml_session",
    });
  } catch (error) {
    return NextResponse.json(
      {
        products: [],
        source: "ml_session",
        error:
          error instanceof Error
            ? error.message
            : "Falha ao buscar produtos via sessao ML.",
      },
      { status: 502 },
    );
  }
}
