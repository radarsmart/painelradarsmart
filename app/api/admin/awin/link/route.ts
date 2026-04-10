import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateAwinLink } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      advertiserId?: unknown;
      destinationUrl?: unknown;
      campaign?: unknown;
      clickref?: unknown;
    };
    const advertiserId = String(body.advertiserId ?? "").trim();
    const destinationUrl = String(body.destinationUrl ?? "").trim();

    if (!advertiserId || !destinationUrl) {
      return NextResponse.json(
        { ok: false, error: "advertiserId e destinationUrl sao obrigatorios." },
        { status: 400 },
      );
    }

    const result = await generateAwinLink({
      advertiserId,
      destinationUrl,
      campaign: String(body.campaign ?? "radar-smart").trim(),
      clickref: String(body.clickref ?? "radar-smart").trim(),
      shorten: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao gerar link AWIN.",
      },
      { status: 500 },
    );
  }
}
