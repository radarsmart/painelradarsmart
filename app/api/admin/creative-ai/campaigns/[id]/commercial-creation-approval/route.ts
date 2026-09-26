import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { resolveCommercialCreationApprovalValidation } from "@/lib/commercial-video/creation-modes/approval-state";
import type { CommercialContractApprovalState } from "@/lib/commercial-video/creation-modes/types";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at";

type CampaignRow = {
  id: string;
  creative_brief: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const action = String(body.action ?? "").toUpperCase();
    const nextStatus: CommercialContractApprovalState =
      action === "APPROVE" ? "APPROVED_FOR_GENERATION" : action === "REJECT" ? "REJECTED" : "DRAFT";

    if (nextStatus === "DRAFT") {
      return NextResponse.json({ error: "Acao invalida. Use APPROVE ou REJECT." }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,creative_brief")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 });

    const campaignRow = campaign as CampaignRow;
    if (!campaignRow.creative_brief?.commercialCreationStoryboard) {
      return NextResponse.json(
        { error: "Gere o storyboard antes de aprovar ou rejeitar." },
        { status: 400 },
      );
    }

    const storyboard = campaignRow.creative_brief.commercialCreationStoryboard;
    const storedFingerprint = isRecord(storyboard) ? String(storyboard.storyboardFingerprint ?? "").trim() : "";
    const requestedFingerprint = String(body.storyboardFingerprint ?? "").trim();
    if (action === "APPROVE" && (!storedFingerprint || !requestedFingerprint || requestedFingerprint !== storedFingerprint)) {
      return NextResponse.json(
        { error: "Storyboard mudou ou esta sem fingerprint. Gere/reabra o storyboard atual antes de aprovar." },
        { status: 409 },
      );
    }
    const now = new Date().toISOString();
    const approvedBy =
      nextStatus === "APPROVED_FOR_GENERATION"
        ? {
            userId: adminGuard.userId,
            email: adminGuard.email,
            role: adminGuard.role,
          }
        : null;
    const approvalValidation = resolveCommercialCreationApprovalValidation({
      approvalStatus: nextStatus,
      currentStoryboardFingerprint: storedFingerprint,
      approvedStoryboardFingerprint: nextStatus === "APPROVED_FOR_GENERATION" ? storedFingerprint : null,
    });
    const updatedBrief = {
      ...(campaignRow.creative_brief ?? {}),
      commercialCreationStatus: nextStatus,
      commercialCreationApprovedFingerprint:
        nextStatus === "APPROVED_FOR_GENERATION" ? storedFingerprint : null,
      commercialCreationApprovedAt: nextStatus === "APPROVED_FOR_GENERATION" ? now : null,
      commercialCreationApprovedBy: approvedBy,
      commercialCreationApproval: approvalValidation,
      commercialCreationStoryboard:
        isRecord(storyboard)
          ? { ...storyboard, approvalState: nextStatus }
          : storyboard,
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
      approvalState: approvalValidation.resolvedApprovalState,
      approvalValidation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar aprovacao." },
      { status: 500 },
    );
  }
}
