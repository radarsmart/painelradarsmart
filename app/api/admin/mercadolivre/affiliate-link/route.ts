import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateMlAffiliateLink } from "@/lib/scraping/ml-session-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: ["admin", "central_oferta"] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as { product_url?: unknown };
  const productUrl = toText(body.product_url);

  if (!productUrl) {
    return NextResponse.json({ error: "product_url e obrigatorio." }, { status: 400 });
  }

  try {
    const affiliateUrl = await generateMlAffiliateLink(productUrl);
    return NextResponse.json({ ok: true, affiliate_url: affiliateUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao gerar link de afiliado do Mercado Livre.",
      },
      { status: 500 },
    );
  }
}
