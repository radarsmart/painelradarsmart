import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { assertExecutionModeIsMock } from "@/lib/generation-orchestrator/guardrails";
import { executeSceneMock } from "@/lib/generation-orchestrator/mock-executor";
import type {
  CampaignExecutionPlan,
  GenerationMode,
  SceneExecutionResult,
} from "@/lib/generation-orchestrator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  creative_brief: (Record<string, unknown> & { generationPlan?: CampaignExecutionPlan }) | null;
};

/**
 * Executa o CampaignExecutionPlan ja preparado. Nesta fase aceita SOMENTE
 * mode = "MOCK" - qualquer outro valor (incluindo "LIVE") retorna 400 sem
 * chamar nenhum provider. Cada cena roda atraves do provider mock
 * existente em lib/ai (ver mock-executor.ts); nenhum credito e consumido.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  let mode: GenerationMode = "MOCK";
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && typeof (body as { mode?: unknown }).mode === "string") {
    mode = (body as { mode: string }).mode as GenerationMode;
  }

  try {
    assertExecutionModeIsMock(mode);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Modo de geracao invalido." },
      { status: 400 },
    );
  }

  try {
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });
    }

    const campaignRow = campaign as CampaignRow;
    const generationPlan = campaignRow.creative_brief?.generationPlan;

    if (!generationPlan) {
      return NextResponse.json(
        {
          error:
            "Campanha ainda nao tem Generation Plan - rode /prepare-generation antes de gerar.",
        },
        { status: 400 },
      );
    }

    const results: SceneExecutionResult[] = [];
    const updatedScenes: CampaignExecutionPlan["scenes"] = [];

    for (const scene of generationPlan.scenes) {
      if (scene.status === "FAILED") {
        // Cena ja reprovada na preparacao (ex: personagem sem PRIMARY) -
        // nunca chega ao provider, mock ou nao.
        updatedScenes.push(scene);
        continue;
      }

      const result = await executeSceneMock(scene, mode);
      results.push(result);
      updatedScenes.push({ ...scene, status: result.status });
    }

    const updatedGenerationPlan: CampaignExecutionPlan & { results: SceneExecutionResult[] } = {
      ...generationPlan,
      mode,
      scenes: updatedScenes,
      results,
    };

    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      generationPlan: updatedGenerationPlan,
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
      generationPlan: updatedGenerationPlan,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao executar a geracao mock." },
      { status: 500 },
    );
  }
}
