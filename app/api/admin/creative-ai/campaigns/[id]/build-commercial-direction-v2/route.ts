import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getProductIntelligenceById } from "@/lib/product-intelligence/repository";
import { buildCommercialDirection } from "@/lib/commercial-director/director";
import { buildCreativeDirectionV2DecisionEngine } from "@/lib/creative-director-v2/decision-engine/decision-engine";
import { buildControlledPersuasionPipeline } from "@/lib/commercial-video/persuasion/pipeline-integration";
import type { CommercialDirection, CommercialDirectorInput } from "@/lib/commercial-director/types";
import type { ObservedPackagingTextInput } from "@/lib/product-intelligence-grounding/types";
import type { PersuasionEngineVersion } from "@/lib/commercial-video/persuasion/types";

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
  creative_brief: (Record<string, unknown> & { commercialDirection?: CommercialDirection }) | null;
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
  image_url: string | null;
};

type BuildCommercialDirectionV2Body = {
  persuasionEngineVersion?: PersuasionEngineVersion;
  observedPackagingTexts?: ObservedPackagingTextInput[];
};

function resolvePersuasionEngineVersion(value: unknown): PersuasionEngineVersion {
  return value === "V1" ? "V1" : "NONE";
}

function parseObservedPackagingTexts(value: unknown): ObservedPackagingTextInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { text: unknown; observedVia: unknown } => Boolean(entry) && typeof entry === "object" && "text" in entry && "observedVia" in entry)
    .map((entry) => ({ text: String(entry.text), observedVia: String(entry.observedVia) }))
    .filter((entry) => entry.text.trim().length > 0 && entry.observedVia.trim().length > 0);
}

/**
 * Gera CommercialCreativeDirectionV2 (Creative Director V2 Decision Engine,
 * READY_FOR_V2_PIPELINE_INTEGRATION=YES) e persiste em
 * creative_brief.commercialDirectionV2 + creative_brief.creativeDirectorVersion="V2".
 *
 * NUNCA sobrescreve creative_brief.commercialDirection (V1) - reusa se ja
 * existir (evita recalcular/re-consultar Character Pack a toa), senao monta
 * V1 primeiro (mesma funcao de sempre, buildCommercialDirection) so como
 * base factual pro V2. Igual ao endpoint V1: nao avanca creative_campaigns.status.
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
    const body = (await req.json().catch(() => null)) as BuildCommercialDirectionV2Body | null;
    const persuasionEngineVersion = resolvePersuasionEngineVersion(body?.persuasionEngineVersion);
    const observedPackagingTexts = parseObservedPackagingTexts(body?.observedPackagingTexts);

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
            "Campanha ainda nao tem Creative Brief completo - rode /build-brief antes de montar a direcao comercial V2.",
        },
        { status: 400 },
      );
    }

    const [offerRes, productIntelligence, personaRes] = await Promise.all([
      supabaseAdmin
        .from("offers")
        .select("title,category,discount_pct,price,original_price,rating,reviews_count,marketplace,image_url")
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

    // Reusa V1 se ja persistido (evita recalcular/re-consultar Character
    // Pack) - senao monta agora, so como base factual pro V2.
    const commercialDirection = campaignRow.creative_brief?.commercialDirection ?? (await buildCommercialDirection(input));

    const persuasionPipeline =
      persuasionEngineVersion === "V1"
        ? buildControlledPersuasionPipeline({
            offer: {
              title: offer.title ?? "produto",
              price: offer.price,
              originalPrice: offer.original_price,
              discountPct: offer.discount_pct,
              marketplace: offer.marketplace,
              brand: null,
              imageUrl: offer.image_url,
              rating: offer.rating,
              reviewsCount: offer.reviews_count,
            },
            productIntelligence: {
              category: productIntelligence.category,
              painPoints: productIntelligence.painPoints,
              desires: productIntelligence.desires,
              objections: productIntelligence.objections,
              purchaseMotivations: productIntelligence.purchaseMotivations,
              keyBenefits: productIntelligence.keyBenefits,
              emotionalBenefits: productIntelligence.emotionalBenefits,
              functionalBenefits: productIntelligence.functionalBenefits,
            },
            observedPackagingTexts,
            useCharacter: Boolean(input.officialCharacterSlug),
          })
        : null;

    const commercialDirectionV2 = await buildCreativeDirectionV2DecisionEngine(
      input,
      commercialDirection,
      persuasionPipeline?.persuasionStrategy ?? null,
    );

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      // commercialDirection (V1) nunca e sobrescrita aqui - so preenchida se
      // ainda nao existia (mesmo objeto reusado acima).
      commercialDirection,
      commercialDirectionV2: commercialDirectionV2.result,
      creativeDirectorVersion: "V2" as const,
      persuasionEngineVersion,
      commercialPersuasion: persuasionPipeline
        ? {
            engineVersion: persuasionPipeline.engineVersion,
            groundedProductIntelligence: persuasionPipeline.groundedProductIntelligence,
            groundingGate: persuasionPipeline.groundingGate,
            cleanedProductIntelligence: persuasionPipeline.cleanedProductIntelligence,
            evidence: persuasionPipeline.evidence,
            desireProfile: persuasionPipeline.desireProfile,
            persuasionStrategy: persuasionPipeline.persuasionStrategy,
            hookDecision: persuasionPipeline.hookDecision,
            hookEvaluations: persuasionPipeline.hookEvaluations.map((entry) => ({
              variantId: entry.variantId,
              label: entry.label,
              metrics: entry.metrics,
              whyViewerWouldStop: entry.whyViewerWouldStop,
              whyViewerWouldKeepWatching: entry.whyViewerWouldKeepWatching,
              firstSecondSignal: entry.firstSecondSignal,
            })),
            scoredStoryboard: persuasionPipeline.scoredStoryboard,
            structuralLimitation: persuasionPipeline.structuralLimitation,
          }
        : null,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      success: true,
      campaign: updated,
      commercialDirectionV2: commercialDirectionV2.result,
      hookStrategyV2: commercialDirectionV2.hookStrategyV2,
      redundancyPassesApplied: commercialDirectionV2.redundancyPassesApplied,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao montar a direcao comercial V2.",
      },
      { status: 500 },
    );
  }
}
