import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LandingPageRow = {
  id: string;
  title: string | null;
  headline: string | null;
  product_title: string | null;
  marketplace: string | null;
  affiliate_url: string | null;
  hero_image_url: string | null;
  product_price: number | string | null;
  product_old_price: number | string | null;
  utm_campaign: string | null;
  updated_at: string | null;
  offer_id: string | null;
  status: string | null;
};

type OfferLookupRow = {
  id: string;
  product_url: string | null;
  category: string | null;
};

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

    const { data, error } = await supabaseAdmin
      .from("landing_pages")
      .select(
        "id,title,headline,product_title,marketplace,affiliate_url,hero_image_url,product_price,product_old_price,utm_campaign,updated_at,offer_id,status",
      )
      .order("updated_at", { ascending: false })
      .limit(120);

    if (error) {
      throw new Error(error.message);
    }

    const landingPages = ((data ?? []) as LandingPageRow[]).filter((item) => {
      if (!search) return true;
      const haystack = [
        toText(item.title),
        toText(item.headline),
        toText(item.product_title),
        toText(item.marketplace),
        toText(item.utm_campaign),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    const offerIds = landingPages
      .map((item) => toText(item.offer_id))
      .filter(Boolean);

    let offerLookup = new Map<string, OfferLookupRow>();
    if (offerIds.length > 0) {
      const { data: offerRows, error: offerError } = await supabaseAdmin
        .from("offers")
        .select("id,product_url,category")
        .in("id", offerIds);

      if (offerError) {
        throw new Error(offerError.message);
      }

      offerLookup = new Map(
        ((offerRows ?? []) as OfferLookupRow[]).map((offer) => [offer.id, offer]),
      );
    }

    return NextResponse.json({
      landingPages: landingPages.map((item) => {
        const linkedOffer = item.offer_id ? offerLookup.get(item.offer_id) : null;
        return {
          ...item,
          source_product_url: linkedOffer?.product_url ?? null,
          source_category: linkedOffer?.category ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar landing pages para criativos.",
      },
      { status: 500 },
    );
  }
}
