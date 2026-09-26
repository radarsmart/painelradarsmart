import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { buildCreativeBrief, CreativeBrainError } from "@/lib/creative-brain/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  offer_id: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { data: campaign, error: fetchError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,offer_id")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });
    }

    const campaignRow = campaign as CampaignRow;
    if (!campaignRow.offer_id) {
      return NextResponse.json(
        { error: "Campanha sem oferta vinculada." },
        { status: 400 },
      );
    }

    const brief = await buildCreativeBrief(campaignRow.offer_id);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("creative_campaigns")
      .update({
        status: "brief_ready",
        product_intelligence_id: brief.productIntelligenceId,
        selected_framework: brief.selectedFramework?.slug ?? null,
        selected_angle: brief.selectedAngle?.slug ?? null,
        selected_persona_id: brief.selectedPersona?.id ?? null,
        duration: brief.duration,
        aspect_ratio: brief.aspectRatio,
        creative_brief: brief,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, campaign: updated, brief });
  } catch (error) {
    const status = error instanceof CreativeBrainError ? 422 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao montar o Creative Brief.",
      },
      { status },
    );
  }
}
