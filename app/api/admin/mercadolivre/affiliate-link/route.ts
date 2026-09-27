import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { OFFER_WORKFLOW_ROLES } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(value: unknown): string {
  return String(value ?? "").trim();
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

  // Geracao automatica via robo local (Playwright abrindo o gerador de link do
  // ML) foi desativada de proposito: o fluxo de captura passou a ser a
  // extensao Garimpar, que gera o link de afiliado direto no navegador de
  // quem esta navegando, sem precisar de nenhuma automacao local visivel.
  return NextResponse.json(
    {
      error:
        "Geracao automatica de link de afiliado do ML esta desativada. Cole o link meli.la manualmente (ou use a extensao Garimpar).",
    },
    { status: 501 },
  );
}
