import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getProductIntelligenceById } from "@/lib/product-intelligence/repository";
import { buildCommercialDirection } from "@/lib/commercial-director/director";
import type { CommercialDirectorInput } from "@/lib/commercial-director/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  offer_id: string | null;
  product_intelligence_id: string | null;
  selected_framework: string | null;
  selected_angle: string | null;
  selected_persona_id: string | null;
  creative_brief: Record<string, unknown> | null;
};

type OfferRow = {
  title: string | null;
  category: string | null;
  discount_pct: number | null;
  price: number | null;
  original_price: number | null;
  rating: number | null;
  reviews_count: number | null;
  marketplace: string | null;
};

/**
 * Gera a CommercialDirection (incluindo o plano de cenas) para uma
 * campanha ja com Creative Brief pronto. NAO avanca o status da campanha
 * - o CHECK atual de creative_campaigns.status nao tem um valor
 * intermediario adequado pra "direcao comercial pronta, roteiro ainda
 * nao". Guardamos o resultado dentro de creative_brief.commercialDirection
 * (jsonb ja existente) em vez de criar migration/coluna nova.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,offer_id,product_intelligence_id,selected_framework,selected_angle,selected_persona_id,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });
    }

    const campaignRow = campaign as CampaignRow;

    if (!campaignRow.offer_id || !campaignRow.product_intelligence_id || !campaignRow.selected_framework) {
      return NextResponse.json(
        {
          error:
            "Campanha ainda nao tem Creative Brief completo - rode /build-brief antes de montar a direcao comercial.",
        },
        { status: 400 },
      );
    }

    const [offerRes, productIntelligence, personaRes] = await Promise.all([
      supabaseAdmin
        .from("offers")
        .select("title,category,discount_pct,price,original_price,rating,reviews_count,marketplace")
        .eq("id", campaignRow.offer_id)
        .maybeSingle(),
      getProductIntelligenceById(campaignRow.product_intelligence_id),
      campaignRow.selected_persona_id
        ? supabaseAdmin
            .from("ugc_personas")
            .select("slug,is_official_brand_character")
            .eq("id", campaignRow.selected_persona_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (offerRes.error) throw new Error(offerRes.error.message);
    if (!offerRes.data) {
      return NextResponse.json({ error: "Oferta da campanha nao encontrada." }, { status: 404 });
    }
    if (!productIntelligence) {
      return NextResponse.json({ error: "Product Intelligence da campanha nao encontrada." }, { status: 404 });
    }

    const offer = offerRes.data as OfferRow;
    const persona = personaRes.data as { slug: string; is_official_brand_character: boolean } | null;

    const input: CommercialDirectorInput = {
      offerId: campaignRow.offer_id,
      productTitle: offer.title ?? "produto",
      category: productIntelligence.category,
      discountPct: offer.discount_pct,
      price: offer.price,
      originalPrice: offer.original_price,
      rating: offer.rating,
      reviewsCount: offer.reviews_count,
      marketplace: offer.marketplace,
      primaryPain: productIntelligence.painPoints[0] ?? "",
      primaryDesire: productIntelligence.desires[0] ?? "",
      primaryObjection: productIntelligence.objections[0] ?? "",
      purchaseMotivation: productIntelligence.purchaseMotivations[0] ?? "",
      frameworkSlug: campaignRow.selected_framework,
      angleSlug: campaignRow.selected_angle ?? "",
      officialCharacterSlug: persona?.is_official_brand_character ? persona.slug : null,
    };

    const commercialDirection = await buildCommercialDirection(input);

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      commercialDirection,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, campaign: updated, commercialDirection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao montar a direcao comercial.",
      },
      { status: 500 },
    );
  }
}
