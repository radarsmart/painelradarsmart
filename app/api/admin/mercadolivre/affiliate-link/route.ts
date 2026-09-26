import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { OFFER_WORKFLOW_ROLES } from "@/lib/admin-permissions";
import { generateMlAffiliateLink } from "@/lib/scraping/ml-session-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toFriendlyAffiliateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("locator.waitfor") ||
    normalized.includes("timeout") ||
    normalized.includes("login/challenges") ||
    normalized.includes("waiting for locator")
  ) {
    return "A sessao de afiliados do Mercado Livre nao conseguiu abrir o gerador de link. A conta pode estar deslogada, com desafio de login ou com a tela de afiliados alterada. Cole o link meli.la manualmente e tente de novo.";
  }

  if (normalized.includes("ml_affiliate_session_api_url")) {
    return "Gerador automatico de link afiliado do Mercado Livre nao configurado.";
  }

  return "Falha ao gerar link de afiliado do Mercado Livre. Cole o link meli.la manualmente e tente de novo.";
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_WORKFLOW_ROLES });
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
        error: toFriendlyAffiliateError(error),
      },
      { status: 500 },
    );
  }
}
