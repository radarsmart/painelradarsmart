import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { validateCanarySceneSelection } from "@/lib/generation-orchestrator/canary-guardrails";
import { executeCanaryScene } from "@/lib/generation-orchestrator/canary-executor";
import { describeOpenAiCharacterImageRequest } from "@/lib/generation-orchestrator/adapters/openai-character-image";
import type {
  CampaignExecutionPlan,
  CanaryLogEntry,
  CanaryRequestInput,
} from "@/lib/generation-orchestrator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  creative_brief:
    | (Record<string, unknown> & {
        generationPlan?: CampaignExecutionPlan;
        canaryLog?: CanaryLogEntry[];
      })
    | null;
};

type CanaryRequestBody = CanaryRequestInput & {
  mode?: string;
  sceneIds?: string[];
};

/**
 * Executa UM teste real controlado (CANARY) para UMA cena. Nunca roda
 * pelo fluxo de campanha completa (/generate so aceita MOCK). LIVE
 * continua bloqueado globalmente. Exige confirmacao explicita, limite de
 * custo obrigatorio, e so permite o UNICO provider real ja avaliado e
 * aprovado (ver canary-guardrails.ts) - sem fallback para outro provider
 * pago se ele falhar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => null)) as CanaryRequestBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  // mode nunca e inferido - so aceitamos o literal exato "CANARY" vindo
  // do corpo da requisicao (validado tambem em assertModeIsCanary, que
  // e o guardrail reaproveitavel por outros callers internos).
  if (body.mode !== "CANARY") {
    return NextResponse.json(
      { error: 'O endpoint /generate-canary so aceita mode="CANARY" explicito no corpo da requisicao.' },
      { status: 400 },
    );
  }

  const sceneIds = body.sceneIds ?? (body.sceneId ? [body.sceneId] : []);
  const sceneSelection = validateCanarySceneSelection(sceneIds);
  if (!sceneSelection.ok) {
    return NextResponse.json({ error: sceneSelection.reason }, { status: 400 });
  }

  const sceneId = sceneIds[0];

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
        { error: "Campanha ainda nao tem Generation Plan - rode /prepare-generation antes do canary." },
        { status: 400 },
      );
    }

    const scenePlan = generationPlan.scenes.find((s) => s.sceneId === sceneId);
    if (!scenePlan) {
      return NextResponse.json({ error: `Cena "${sceneId}" nao encontrada no Generation Plan.` }, { status: 404 });
    }

    const input: CanaryRequestInput = {
      sceneId,
      confirmed: Boolean(body.confirmed),
      maxCostBRL: body.maxCostBRL,
      acknowledgeUnknownCost: body.acknowledgeUnknownCost,
      dryRun: body.dryRun,
    };

    const result = await executeCanaryScene(scenePlan, input);

    const logEntry: CanaryLogEntry = {
      campaignId: campaignRow.id,
      sceneId,
      provider: result.provider,
      mode: "CANARY",
      estimatedCost: scenePlan.estimatedCost,
      actualCost: { credits: result.creditsUsed, currencyCostCents: result.currencyCostCents },
      success: result.status === "COMPLETED",
      error: result.error,
      createdAt: result.createdAt,
    };

    const previousLog = campaignRow.creative_brief?.canaryLog ?? [];
    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      canaryLog: [...previousLog, logEntry],
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      success: result.status === "COMPLETED",
      campaign: updated,
      result,
      logEntry,
      providerRequestPreview:
        scenePlan.selectedProvider === "openai-image-edit"
          ? describeOpenAiCharacterImageRequest(scenePlan.providerRequest)
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao executar o canary." },
      { status: 500 },
    );
  }
}
