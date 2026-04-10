import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { shortenLomadeeUrl } from "@/lib/lomadee/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      url?: unknown;
      organizationId?: unknown;
      productId?: unknown;
    };
    const url = String(body.url ?? "").trim();
    const organizationId = String(body.organizationId ?? "").trim();
    const productId = String(body.productId ?? "").trim();

    if (!url || !organizationId) {
      return NextResponse.json(
        { error: "url e organizationId sao obrigatorios." },
        { status: 400 },
      );
    }

    const shortUrl = await shortenLomadeeUrl({
      url,
      organizationId,
      mdasc: productId ? `radar-smart-${productId}` : "radar-smart",
    });

    return NextResponse.json({ ok: true, url: shortUrl });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Falha ao encurtar URL Lomadee.",
      },
      { status: 500 },
    );
  }
}
