import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { listCandidateOffersForVideo } from "@/lib/tiktok-engine/from-offer";
import { buildGeminiVideoPrompt } from "@/lib/tiktok-engine/gemini-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function extractBearer(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

// GET: lista ofertas reais candidatas (mesma fonte do tiktok-engine).
export async function GET(req: NextRequest) {
  if (!extractBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const offers = await listCandidateOffersForVideo(30);
    return NextResponse.json({ success: true, offers });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Falha ao listar ofertas." },
      { status: 500 },
    );
  }
}

// POST { offer_id }: gera o texto do prompt pronto pra colar no Gemini/Veo.
export async function POST(req: NextRequest) {
  if (!extractBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await req.json();
    const offerId = String(body?.offer_id ?? "").trim();
    if (!offerId) {
      return NextResponse.json({ success: false, error: "offer_id obrigatorio." }, { status: 400 });
    }

    const result = await buildGeminiVideoPrompt(offerId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Falha ao gerar prompt." },
      { status: 500 },
    );
  }
}
