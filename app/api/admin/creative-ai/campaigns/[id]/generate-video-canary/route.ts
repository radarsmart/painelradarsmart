import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  APPROVED_VIDEO_CANARY_CFG_SCALE,
  APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT,
  APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT_10S,
  APPROVED_VIDEO_CANARY_PROMPT,
  APPROVED_VIDEO_CANARY_PROMPT_10S,
  APPROVED_VIDEO_CANARY_PROVIDER,
  isValidVideoCanaryMode,
  validateVideoCanarySelection,
} from "@/lib/generation-orchestrator/video-canary-guardrails";
import { executeVideoCanary } from "@/lib/generation-orchestrator/video-canary-executor";
import type { VideoCanaryRequestInput, VideoCanaryResult } from "@/lib/generation-orchestrator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  creative_brief: (Record<string, unknown> & { canaryVideoLog?: VideoCanaryResult[] }) | null;
};

type VideoCanaryRequestBody = {
  mode?: string;
  inputImageUrl?: string;
  inputImageUrls?: string[];
  prompt?: string;
  negativePrompt?: string;
  duration?: string;
  cfgScale?: number;
  confirmed?: boolean;
  maxCostBRL?: number;
  dryRun?: boolean;
  // Categoria do produto (ex: "suplementos") - quando informada, ativa a
  // checagem de claims em video-canary-guardrails.ts antes do submit.
  category?: string;
};

/**
 * Executa UM teste real controlado de image-to-video (CANARY) a partir de
 * uma imagem ja aprovada (nao precisa estar no Character Pack). Nunca
 * roda pelo fluxo normal de campanha. LIVE continua bloqueado. So o
 * provider freepik-kling-i2v e aprovado nesta primeira fase, sem
 * fallback pago. Ver video-canary-guardrails.ts para todas as regras.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => null)) as VideoCanaryRequestBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  // mode nunca e inferido - so aceitamos o literal exato "CANARY".
  if (!isValidVideoCanaryMode(body.mode ?? "")) {
    return NextResponse.json(
      { error: 'O endpoint /generate-video-canary so aceita mode="CANARY" explicito no corpo da requisicao.' },
      { status: 400 },
    );
  }

  const inputImageUrls = body.inputImageUrls ?? (body.inputImageUrl ? [body.inputImageUrl] : []);
  const selection = validateVideoCanarySelection(inputImageUrls);
  if (!selection.ok) {
    return NextResponse.json({ error: selection.reason }, { status: 400 });
  }

  // Prompt/negative prompt default dependem da duracao pedida - "10" usa
  // o roteiro de atuacao/continuidade aprovado para o 2o canary; qualquer
  // outra duracao (hoje so "5") usa o do 1o canary, ja validado com
  // resultado real. Overrides explicitos no corpo continuam permitidos.
  const duration = body.duration || "5";
  const [defaultPrompt, defaultNegativePrompt] =
    duration === "10"
      ? [APPROVED_VIDEO_CANARY_PROMPT_10S, APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT_10S]
      : [APPROVED_VIDEO_CANARY_PROMPT, APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT];

  const input: VideoCanaryRequestInput = {
    provider: APPROVED_VIDEO_CANARY_PROVIDER,
    inputImageUrl: inputImageUrls[0],
    prompt: body.prompt || defaultPrompt,
    negativePrompt: body.negativePrompt || defaultNegativePrompt,
    duration,
    cfgScale: typeof body.cfgScale === "number" ? body.cfgScale : APPROVED_VIDEO_CANARY_CFG_SCALE,
    confirmed: Boolean(body.confirmed),
    maxCostBRL: typeof body.maxCostBRL === "number" ? body.maxCostBRL : NaN,
    dryRun: body.dryRun,
    category: body.category || undefined,
  };

  try {
    const result = await executeVideoCanary(input);

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
    const previousLog = campaignRow.creative_brief?.canaryVideoLog ?? [];
    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      canaryVideoLog: [...previousLog, result],
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({ creative_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: result.status === "COMPLETED", campaign: updated, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao executar o canary de video." },
      { status: 500 },
    );
  }
}
