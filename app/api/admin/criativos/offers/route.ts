import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = toText(req.nextUrl.searchParams.get("q")).toLowerCase();

    const query = supabaseAdmin
      .from("offers")
      .select(
        "id,title,marketplace,category,product_url,affiliate_url,image_url,price,old_price,original_price,discount_pct,updated_at,status",
      )
      .not("affiliate_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(120);

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const offers = (data ?? []).filter((offer) => {
      if (!search) return true;
      const haystack = [
        toText(offer.title),
        toText(offer.marketplace),
        toText(offer.category),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    return NextResponse.json({ offers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar ofertas para criativos." },
      { status: 500 },
    );
  }
}
