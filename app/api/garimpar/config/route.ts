import { NextRequest, NextResponse } from "next/server";

import { checkGarimparToken } from "@/lib/garimpar/auth";
import { garimparCorsPreflight, withGarimparCors } from "@/lib/garimpar/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

// So a Amazon precisa de uma tag vinda do servidor (reescrita de URL pura).
// Mercado Livre gera o link dentro do proprio navegador usando a sessao
// logada do usuario (nao depende de config nenhuma daqui); Shopee nao gera
// link nenhum na extensao — so extrai dado bruto, o backend ja resolve via
// API oficial depois, do jeito que ja resolve hoje pras ofertas vindas dos
// agentes. Magalu fica fora desta fase (sem programa de afiliado configurado
// no projeto ainda).
export async function OPTIONS() {
  return garimparCorsPreflight();
}

export async function GET(req: NextRequest) {
  const auth = checkGarimparToken(req);
  if (!auth.ok) {
    return withGarimparCors(NextResponse.json({ error: auth.error }, { status: auth.status }));
  }

  const amazonTag =
    toText(process.env.AMAZON_TRACKING_ID) || toText(process.env.AMAZON_AFFILIATE_TAG) || "";

  return withGarimparCors(
    NextResponse.json({
      ok: true,
      platforms: {
        amazon: {
          enabled: true,
          link_mode: "backend_resolves",
          tag: amazonTag || null,
        },
        mercadolivre: {
          enabled: true,
          link_mode: "browser_session",
          tag: null,
        },
        shopee: {
          enabled: true,
          link_mode: "backend_resolves",
          tag: null,
        },
        magalu: {
          enabled: false,
          link_mode: null,
          tag: null,
        },
      },
    }),
  );
}
