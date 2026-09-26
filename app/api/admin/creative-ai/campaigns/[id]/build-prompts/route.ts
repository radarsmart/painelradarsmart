import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getProductIntelligenceById } from "@/lib/product-intelligence/repository";
import { getDefaultBrandAsset } from "@/lib/brand-assets/repository";
import { buildCampaignPromptPlan, type PromptBuilderCreativeDirectorV2Input } from "@/lib/prompt-builder/prompt-builder";
import { resolveCreativeDirectorVersion } from "@/lib/creative-director-v2/version";
import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";
import type { Platform } from "@/lib/prompt-builder/types";

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
  aspect_ratio: string | null;
  platform: string | null;
  creative_brief:
    | (Record<string, unknown> & {
        commercialDirection?: CommercialDirection;
        commercialDirectionV2?: CommercialCreativeDirectionV2;
        creativeDirectorVersion?: string;
      })
    | null;
};

function resolvePlatform(value: string | null): Platform {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

/**
 * Gera o CampaignPromptPlan (prompts estruturados por cena) a partir da
 * CommercialDirection ja existente na campanha. NAO chama nenhum provider
 * - so constroi texto/estrutura. Persistido em
 * creative_brief.promptPlan (jsonb existente, sem migration).
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
      .select("id,offer_id,product_intelligence_id,aspect_ratio,platform,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });
    }

    const campaignRow = campaign as CampaignRow;

    // Version-aware (lib/creative-director-v2/version.ts): ausente = "V1",
    // nunca reinterpreta campanha antiga como V2 sozinho. So usa V2 quando
    // creative_brief.creativeDirectorVersion==="V2" E commercialDirectionV2
    // ja foi persistido (/build-commercial-direction-v2).
    const creativeDirectorVersion = resolveCreativeDirectorVersion(campaignRow.creative_brief?.creativeDirectorVersion);
    const commercialDirectionV2 = campaignRow.creative_brief?.commercialDirectionV2;

    const commercialDirection =
      creativeDirectorVersion === "V2" && commercialDirectionV2
        ? commercialDirectionV2.underlyingDirection
        : campaignRow.creative_brief?.commercialDirection;

    if (!commercialDirection) {
      return NextResponse.json(
        {
          error:
            creativeDirectorVersion === "V2"
              ? "Campanha esta marcada como V2 mas ainda nao tem Commercial Direction V2 - rode /build-commercial-direction-v2 antes de preparar os prompts."
              : "Campanha ainda nao tem Commercial Direction - rode /build-commercial-direction antes de preparar os prompts.",
        },
        { status: 400 },
      );
    }

    const creativeDirectorV2Input: PromptBuilderCreativeDirectorV2Input | undefined =
      creativeDirectorVersion === "V2" && commercialDirectionV2
        ? {
            sceneBlueprints: commercialDirectionV2.sceneBlueprints,
            ctaDirection: commercialDirectionV2.ctaDirection,
            persuasionStrategy: commercialDirectionV2.persuasionStrategy ?? null,
          }
        : undefined;

    if (!campaignRow.offer_id || !campaignRow.product_intelligence_id) {
      return NextResponse.json({ error: "Campanha sem oferta ou Product Intelligence vinculada." }, { status: 400 });
    }

    const [offerRes, productIntelligence, defaultLogo] = await Promise.all([
      supabaseAdmin.from("offers").select("title").eq("id", campaignRow.offer_id).maybeSingle(),
      getProductIntelligenceById(campaignRow.product_intelligence_id),
      getDefaultBrandAsset("LOGO"),
    ]);

    if (offerRes.error) throw new Error(offerRes.error.message);
    if (!offerRes.data) {
      return NextResponse.json({ error: "Oferta da campanha nao encontrada." }, { status: 404 });
    }
    if (!productIntelligence) {
      return NextResponse.json({ error: "Product Intelligence da campanha nao encontrada." }, { status: 404 });
    }

    const promptPlan = buildCampaignPromptPlan(
      campaignRow.id,
      commercialDirection,
      {
        productTitle: (offerRes.data as { title: string | null }).title ?? "produto",
        category: productIntelligence.category,
        platform: resolvePlatform(campaignRow.platform),
        aspectRatio: campaignRow.aspect_ratio ?? "9:16",
        defaultLogoAssetId: defaultLogo?.id ?? null,
      },
      creativeDirectorV2Input,
    );

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      promptPlan,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, campaign: updated, promptPlan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao montar o Prompt Plan." },
      { status: 500 },
    );
  }
}
