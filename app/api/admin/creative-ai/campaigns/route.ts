import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id,offer_id,product_intelligence_id,name,objective,platform,duration,aspect_ratio,status," +
  "selected_framework,selected_angle,selected_persona_id,creative_brief,hook,script,storyboard," +
  "generation_prompt,caption,cta,hashtags,approval_status,created_at,updated_at," +
  "offers(id,title,image_url,marketplace,price)";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("creative_campaigns")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    return NextResponse.json({ campaigns: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao listar campanhas.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const offerId = toText(body.offerId);
    const name = toText(body.name);

    if (!offerId || !name) {
      return NextResponse.json(
        { error: "offerId e name sao obrigatorios para criar uma campanha." },
        { status: 400 },
      );
    }

    const payload = {
      offer_id: offerId,
      product_intelligence_id: toText(body.productIntelligenceId) || null,
      name,
      objective: toText(body.objective) || "conversion",
      platform: toText(body.platform) || "tiktok",
      aspect_ratio: toText(body.aspectRatio) || "9:16",
      status: "draft",
      approval_status: "pending",
      created_by_user_id: adminGuard.userId,
      created_by_email: adminGuard.email,
    };

    const { data, error } = await supabaseAdmin
      .from("creative_campaigns")
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, campaign: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao criar campanha.",
      },
      { status: 500 },
    );
  }
}
