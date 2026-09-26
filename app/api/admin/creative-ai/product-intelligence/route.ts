import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { analyzeProductWithClaimsAudit } from "@/lib/product-intelligence/analyze";
import {
  getLatestProductIntelligence,
  listProductIntelligenceVersions,
  saveProductIntelligenceVersion,
} from "@/lib/product-intelligence/repository";
import type { OfferForAnalysis } from "@/lib/product-intelligence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

async function fetchOfferForAnalysis(offerId: string): Promise<OfferForAnalysis> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,category,marketplace,price,original_price,discount_pct")
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar oferta: ${error.message}`);
  if (!data) throw new Error("Oferta nao encontrada.");

  return {
    id: data.id,
    title: data.title,
    category: data.category,
    marketplace: data.marketplace,
    price: data.price,
    originalPrice: data.original_price,
    discountPct: data.discount_pct,
  };
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const offerId = toText(req.nextUrl.searchParams.get("offerId"));
    if (!offerId) {
      return NextResponse.json({ error: "offerId e obrigatorio." }, { status: 400 });
    }

    const includeAll = toText(req.nextUrl.searchParams.get("all")) === "true";

    if (includeAll) {
      const versions = await listProductIntelligenceVersions(offerId);
      return NextResponse.json({ versions });
    }

    const latest = await getLatestProductIntelligence(offerId);
    return NextResponse.json({ productIntelligence: latest });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar Product Intelligence.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const offerId = toText(body.offerId);
    if (!offerId) {
      return NextResponse.json({ error: "offerId e obrigatorio." }, { status: 400 });
    }

    const offer = await fetchOfferForAnalysis(offerId);
    const { draft, claimsAudit } = analyzeProductWithClaimsAudit(offer);
    const saved = await saveProductIntelligenceVersion(offerId, draft, {
      userId: adminGuard.userId,
      email: adminGuard.email,
    });

    // claimsAudit e so para transparencia nesta resposta - nunca
    // persistido (sem migration); o dado que importa e que `draft` (e
    // portanto `saved`) ja saiu filtrado de analyzeProductWithClaimsAudit.
    return NextResponse.json({ success: true, productIntelligence: saved, claimsAudit });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao analisar produto.",
      },
      { status: 500 },
    );
  }
}
