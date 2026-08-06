import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { classifyProduct } from "@/lib/ugc/product-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    offer_id?: unknown;
    title?: unknown;
    price?: unknown;
    category?: unknown;
    marketplace?: unknown;
    discount_pct?: unknown;
  };

  const offerId = toText(body.offer_id);

  try {
    let title = toText(body.title);
    let price = Number(body.price) || 0;
    let category = toText(body.category) || null;
    let marketplace = toText(body.marketplace) || null;
    let discountPct = Number(body.discount_pct) || null;

    if (offerId) {
      const { data: offer, error } = await supabaseAdmin
        .from("offers")
        .select("title,price,category,marketplace,discount_pct")
        .eq("id", offerId)
        .maybeSingle();

      if (error) throw new Error(`Falha ao buscar oferta: ${error.message}`);
      if (!offer) throw new Error("Oferta nao encontrada.");

      title = String(offer.title ?? "");
      price = Number(offer.price) || 0;
      category = offer.category ? String(offer.category) : null;
      marketplace = offer.marketplace ? String(offer.marketplace) : null;
      discountPct = Number(offer.discount_pct) || null;
    }

    if (!title || price <= 0) {
      return NextResponse.json(
        { error: "title e price sao obrigatorios (ou informe offer_id valido)." },
        { status: 400 },
      );
    }

    const classification = await classifyProduct({
      title,
      price,
      category,
      marketplace,
      discountPct,
    });

    return NextResponse.json({ success: true, classification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao classificar produto." },
      { status: 500 },
    );
  }
}
