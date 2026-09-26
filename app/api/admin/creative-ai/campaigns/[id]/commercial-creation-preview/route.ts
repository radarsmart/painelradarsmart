import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { selectCharacterReferencePair } from "@/lib/brand-character/character-pack";
import { resolveCommercialCreationApprovalValidation } from "@/lib/commercial-video/creation-modes/approval-state";
import { buildCommercialCreationModePreview } from "@/lib/commercial-video/creation-modes/storyboard-builder";
import type {
  CommercialCreationMode,
  CommercialCreativeContract,
  CommercialPrimaryObjective,
  PresenterPreference,
  ProductUsagePreference,
} from "@/lib/commercial-video/creation-modes/types";
import { getProductIntelligenceById } from "@/lib/product-intelligence/repository";
import { supabaseAdmin } from "@/lib/supabase";

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
  selected_persona_id: string | null;
  platform: string | null;
  aspect_ratio: string | null;
  creative_brief: Record<string, unknown> | null;
};

type OfferRow = {
  id: string;
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

type PersonaRow = {
  slug: string;
  is_official_brand_character: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveCreationMode(value: unknown): CommercialCreationMode | null {
  if (
    value === "PRODUCT_COMMERCIAL" ||
    value === "PRESENTER_UGC" ||
    value === "HYBRID_SALES" ||
    value === "TREND_REFERENCE_REMIX"
  ) {
    return value;
  }
  return null;
}

function resolvePrimaryObjective(value: unknown): CommercialPrimaryObjective | null {
  if (
    value === "PRODUCT_SALE" ||
    value === "SALES" ||
    value === "TRAFFIC" ||
    value === "VIP_GROUP" ||
    value === "ENGAGEMENT" ||
    value === "CUSTOM"
  ) {
    return value;
  }
  return null;
}

function resolvePresenterPreference(value: unknown): PresenterPreference | null {
  if (value === "AUTO" || value === "NO_PRESENTER" || value === "HOOK_AND_CTA" || value === "PRESENTER_LED") {
    return value;
  }
  return null;
}

function resolveProductUsagePreference(value: unknown): ProductUsagePreference | null {
  if (
    value === "AUTO" ||
    value === "PACKSHOT_FIRST" ||
    value === "DEMONSTRATE_USE" ||
    value === "HOLD_AND_POINT" ||
    value === "NO_USAGE_DEMO"
  ) {
    return value;
  }
  return null;
}

function parseContract(body: unknown, campaign: CampaignRow): CommercialCreativeContract | null {
  if (!isRecord(body)) return null;
  const raw = isRecord(body.contract) ? body.contract : body;
  if (!isRecord(raw)) return null;
  const creationMode = resolveCreationMode(raw.creationMode ?? "PRODUCT_COMMERCIAL");
  const primaryObjective = resolvePrimaryObjective(raw.primaryObjective ?? "SALES");
  const presenterPreference = resolvePresenterPreference(raw.presenterPreference ?? "AUTO");
  const productUsagePreference = resolveProductUsagePreference(raw.productUsagePreference ?? "AUTO");
  if (!creationMode || !primaryObjective || !presenterPreference || !productUsagePreference) return null;

  return {
    productId: String(raw.productId ?? campaign.offer_id ?? ""),
    campaignId: campaign.id,
    creationMode,
    userPrompt: String(raw.userPrompt ?? ""),
    targetDuration: Number(raw.targetDuration ?? 15),
    tone: String(raw.tone ?? "direto e persuasivo"),
    visualStyle: String(raw.visualStyle ?? "Radar Smart premium"),
    primaryObjective,
    callToActions: Array.isArray(raw.callToActions) ? raw.callToActions.map(String) : [],
    mustShow: Array.isArray(raw.mustShow) ? raw.mustShow.map(String) : [],
    mustSay: Array.isArray(raw.mustSay) ? raw.mustSay.map(String) : [],
    mustAvoid: Array.isArray(raw.mustAvoid) ? raw.mustAvoid.map(String) : [],
    presenterPreference,
    productUsagePreference,
    referenceVideo: isRecord(raw.referenceVideo)
      ? {
          sourceUrl: raw.referenceVideo.sourceUrl ? String(raw.referenceVideo.sourceUrl) : null,
          sourceLabel: raw.referenceVideo.sourceLabel ? String(raw.referenceVideo.sourceLabel) : null,
          preserveStructure: Boolean(raw.referenceVideo.preserveStructure),
          preservePacing: Boolean(raw.referenceVideo.preservePacing),
          preserveHookMechanism: Boolean(raw.referenceVideo.preserveHookMechanism),
          preserveCameraLanguage: Boolean(raw.referenceVideo.preserveCameraLanguage),
          preserveProductPresentationMechanism: Boolean(raw.referenceVideo.preserveProductPresentationMechanism),
          preserveCtaMechanism: Boolean(raw.referenceVideo.preserveCtaMechanism),
        }
      : null,
  };
}

function normalizePlatform(value: string | null): "TIKTOK" | "INSTAGRAM_REELS" | "META_ADS" {
  if (value === "INSTAGRAM_REELS" || value === "META_ADS") return value;
  return "TIKTOK";
}

async function resolvePresenterAssets(campaign: CampaignRow): Promise<{
  identityReferenceAssetId: string | null;
  supportReferenceAssetId: string | null;
}> {
  if (!campaign.selected_persona_id) {
    return { identityReferenceAssetId: null, supportReferenceAssetId: null };
  }

  const { data, error } = await supabaseAdmin
    .from("ugc_personas")
    .select("slug,is_official_brand_character")
    .eq("id", campaign.selected_persona_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const persona = data as PersonaRow | null;
  if (!persona?.is_official_brand_character) {
    return { identityReferenceAssetId: null, supportReferenceAssetId: null };
  }

  const pair = await selectCharacterReferencePair({
    characterSlug: persona.slug,
    expression: "INVITING",
    pose: "PRESENTING",
    shot: "HALF_BODY",
  });

  return {
    identityReferenceAssetId: pair.identityReference?.id ?? null,
    supportReferenceAssetId: pair.supportReference?.id ?? null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,offer_id,product_intelligence_id,selected_persona_id,platform,aspect_ratio,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });

    const campaignRow = campaign as CampaignRow;
    if (!campaignRow.offer_id || !campaignRow.product_intelligence_id) {
      return NextResponse.json(
        { error: "Campanha precisa de oferta e Product Intelligence antes do storyboard." },
        { status: 400 },
      );
    }

    const contract = parseContract(body, campaignRow);
    if (!contract || !contract.productId) {
      return NextResponse.json({ error: "Contrato criativo invalido." }, { status: 400 });
    }

    const [offerRes, productIntelligence, presenterAssetIds] = await Promise.all([
      supabaseAdmin
        .from("offers")
        .select("id,title,category,discount_pct,price,original_price,rating,reviews_count,marketplace,image_url")
        .eq("id", campaignRow.offer_id)
        .maybeSingle(),
      getProductIntelligenceById(campaignRow.product_intelligence_id),
      resolvePresenterAssets(campaignRow),
    ]);

    if (offerRes.error) throw new Error(offerRes.error.message);
    if (!offerRes.data) return NextResponse.json({ error: "Oferta nao encontrada." }, { status: 404 });
    if (!productIntelligence) {
      return NextResponse.json({ error: "Product Intelligence nao encontrado." }, { status: 404 });
    }

    const offer = offerRes.data as OfferRow;
    const preview = buildCommercialCreationModePreview({
      contract,
      offer: {
        id: offer.id,
        title: offer.title ?? "produto",
        category: productIntelligence.category,
        price: offer.price,
        originalPrice: offer.original_price,
        discountPct: offer.discount_pct,
        rating: offer.rating,
        reviewsCount: offer.reviews_count,
        marketplace: offer.marketplace,
        imageUrl: offer.image_url,
      },
      productIntelligence,
      platform: normalizePlatform(campaignRow.platform),
      aspectRatio: campaignRow.aspect_ratio ?? "9:16",
      defaultLogoAssetId: null,
      presenterAssetIds,
    });

    const previousApproval = resolveCommercialCreationApprovalValidation({
      approvalStatus: campaignRow.creative_brief?.commercialCreationStatus,
      currentStoryboardFingerprint: isRecord(campaignRow.creative_brief?.commercialCreationStoryboard)
        ? campaignRow.creative_brief.commercialCreationStoryboard.storyboardFingerprint
        : null,
      approvedStoryboardFingerprint: campaignRow.creative_brief?.commercialCreationApprovedFingerprint,
    });
    const preservesPreviousApproval =
      previousApproval.approvalValid &&
      previousApproval.approvedStoryboardFingerprint === preview.storyboardFingerprint;
    const approvalState = preservesPreviousApproval ? "APPROVED_FOR_GENERATION" : preview.approvalState;
    const storyboard = { ...preview, approvalState };
    const approvalValidation = resolveCommercialCreationApprovalValidation({
      approvalStatus: approvalState,
      currentStoryboardFingerprint: storyboard.storyboardFingerprint,
      approvedStoryboardFingerprint: preservesPreviousApproval ? previousApproval.approvedStoryboardFingerprint : null,
    });

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      commercialCreationModeVersion: "V1",
      commercialCreationContract: storyboard.contract,
      commercialCreationStoryboard: storyboard,
      commercialCreationStatus: approvalState,
      commercialCreationApprovedFingerprint:
        approvalState === "APPROVED_FOR_GENERATION" ? previousApproval.approvedStoryboardFingerprint : null,
      commercialCreationApprovedAt:
        approvalState === "APPROVED_FOR_GENERATION" ? campaignRow.creative_brief?.commercialCreationApprovedAt ?? null : null,
      commercialCreationApprovedBy:
        approvalState === "APPROVED_FOR_GENERATION" ? campaignRow.creative_brief?.commercialCreationApprovedBy ?? null : null,
      commercialCreationApproval: approvalValidation,
      commercialCreationGenerationPlan: storyboard.generationPlan,
      commercialCreationCosts: storyboard.totals,
      commercialDirection: storyboard.commercialDirection,
      promptPlan: storyboard.promptPlan,
      generationPlan: storyboard.generationPlan,
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
      storyboard,
      generationPlan: storyboard.generationPlan,
      approvalValidation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar storyboard." },
      { status: 500 },
    );
  }
}
