import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveCampaignSceneReferences } from "@/lib/generation-orchestrator/reference-resolver";
import { buildCampaignExecutionPlan } from "@/lib/generation-orchestrator/orchestrator";
import { getProductIntelligenceById } from "@/lib/product-intelligence/repository";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";

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
  creative_brief: (Record<string, unknown> & { promptPlan?: CampaignPromptPlan }) | null;
};

/**
 * Gera o CampaignExecutionPlan (capability/provider/custo por cena) a
 * partir do CampaignPromptPlan ja existente. NAO chama nenhum provider -
 * so decide o que SERIA chamado e monta o plano. Persistido em
 * creative_brief.generationPlan (jsonb existente, sem migration). Modo
 * sempre MOCK nesta fase (nao ha ainda como habilitar LIVE).
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
      .select("id,offer_id,product_intelligence_id,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });
    }

    const campaignRow = campaign as CampaignRow;
    const promptPlan = campaignRow.creative_brief?.promptPlan;

    if (!promptPlan) {
      return NextResponse.json(
        {
          error:
            "Campanha ainda nao tem Prompt Plan - rode /build-prompts antes de preparar a geracao.",
        },
        { status: 400 },
      );
    }

    // Categoria do Product Intelligence - so alimenta o Product Reference
    // Quality Gate (sinal fraco, ver product-reference-quality.ts). Se a
    // campanha nao tiver Product Intelligence vinculada por algum motivo,
    // cai para "geral" em vez de falhar a preparacao inteira por causa
    // disso.
    const productIntelligence = campaignRow.product_intelligence_id
      ? await getProductIntelligenceById(campaignRow.product_intelligence_id)
      : null;

    const resolvedRefsBySceneId = await resolveCampaignSceneReferences(
      promptPlan,
      campaignRow.offer_id,
      productIntelligence?.category ?? "geral",
    );

    const generationPlan = buildCampaignExecutionPlan(
      campaignRow.id,
      "MOCK",
      promptPlan,
      resolvedRefsBySceneId,
    );

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      generationPlan,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, campaign: updated, generationPlan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao preparar a geracao." },
      { status: 500 },
    );
  }
}
