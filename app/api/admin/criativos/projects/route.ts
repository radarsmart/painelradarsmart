import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = toText(req.nextUrl.searchParams.get("q")).toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("ugc_projects")
      .select(
        "id,campaign_name,title,marketplace,category,product_url,affiliate_url,image_url,price,original_price,ugc_type,voice_key,objective,status,persona_id,offer_id,landing_page_id,template_id,angle_id,voice_direction,behavior_direction,current_script,current_briefing,updated_at,created_at,ugc_personas(id,name,slug,archetype,visual_style,tone,energy),ugc_templates(id,name,slug,objective),ugc_angles(id,name,slug,angle_type)",
      )
      .order("updated_at", { ascending: false })
      .limit(80);

    if (error) {
      throw new Error(error.message);
    }

    const projects = (data ?? []).filter((project) => {
      if (!search) return true;

      const persona = normalizeJsonObject(project.ugc_personas);
      const haystack = [
        toText(project.campaign_name),
        toText(project.title),
        toText(project.marketplace),
        toText(project.category),
        toText(project.status),
        toText(persona.name),
        toText(persona.archetype),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar projetos de criativos.",
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

    const payload = {
      offer_id: toText(body.offerId) || null,
      landing_page_id: toText(body.landingPageId) || null,
      persona_id: toText(body.personaId) || null,
      template_id: toText(body.templateId) || null,
      angle_id: toText(body.angleId) || null,
      campaign_name: toText(body.campaignName),
      title: toText(body.title),
      marketplace: toText(body.marketplace) || null,
      category: toText(body.category) || null,
      product_url: toText(body.productUrl),
      affiliate_url: toText(body.affiliateUrl) || null,
      image_url: toText(body.imageUrl) || null,
      price: toNumberOrNull(body.price),
      original_price: toNumberOrNull(body.originalPrice),
      ugc_type: toText(body.ugcType) || "model-a",
      voice_key: toText(body.voiceKey) || "mateus",
      objective: toText(body.objective) || "conversion",
      status: toText(body.status) || "draft",
      voice_direction: normalizeJsonObject(body.voiceDirection),
      behavior_direction: normalizeJsonObject(body.behaviorDirection),
      current_script: normalizeJsonObject(body.currentScript),
      current_briefing: normalizeJsonObject(body.currentBriefing),
      metadata: normalizeJsonObject(body.metadata),
      created_by_user_id: adminGuard.userId,
      created_by_email: adminGuard.email,
      updated_at: new Date().toISOString(),
    };

    if (!payload.campaign_name || !payload.title || !payload.product_url) {
      return NextResponse.json(
        {
          error:
            "Campanha, titulo e URL do produto sao obrigatorios para salvar o projeto.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ugc_projects")
      .insert(payload)
      .select(
        "id,campaign_name,title,marketplace,category,product_url,affiliate_url,image_url,price,original_price,ugc_type,voice_key,objective,status,persona_id,offer_id,landing_page_id,template_id,angle_id,voice_direction,behavior_direction,current_script,current_briefing,updated_at,created_at,ugc_personas(id,name,slug,archetype,visual_style,tone,energy),ugc_templates(id,name,slug,objective),ugc_angles(id,name,slug,angle_type)",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, project: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao salvar projeto de criativo.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const projectId = toText(body.id);
    if (!projectId) {
      return NextResponse.json({ error: "ID do projeto e obrigatorio." }, { status: 400 });
    }

    const payload = {
      offer_id: toText(body.offerId) || null,
      landing_page_id: toText(body.landingPageId) || null,
      persona_id: toText(body.personaId) || null,
      template_id: toText(body.templateId) || null,
      angle_id: toText(body.angleId) || null,
      campaign_name: toText(body.campaignName),
      title: toText(body.title),
      marketplace: toText(body.marketplace) || null,
      category: toText(body.category) || null,
      product_url: toText(body.productUrl),
      affiliate_url: toText(body.affiliateUrl) || null,
      image_url: toText(body.imageUrl) || null,
      price: toNumberOrNull(body.price),
      original_price: toNumberOrNull(body.originalPrice),
      ugc_type: toText(body.ugcType) || "model-a",
      voice_key: toText(body.voiceKey) || "mateus",
      objective: toText(body.objective) || "conversion",
      status: toText(body.status) || "draft",
      voice_direction: normalizeJsonObject(body.voiceDirection),
      behavior_direction: normalizeJsonObject(body.behaviorDirection),
      current_script: normalizeJsonObject(body.currentScript),
      current_briefing: normalizeJsonObject(body.currentBriefing),
      metadata: normalizeJsonObject(body.metadata),
      updated_at: new Date().toISOString(),
    };

    if (!payload.campaign_name || !payload.title || !payload.product_url) {
      return NextResponse.json(
        {
          error:
            "Campanha, titulo e URL do produto sao obrigatorios para atualizar o projeto.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ugc_projects")
      .update(payload)
      .eq("id", projectId)
      .select(
        "id,campaign_name,title,marketplace,category,product_url,affiliate_url,image_url,price,original_price,ugc_type,voice_key,objective,status,persona_id,offer_id,landing_page_id,template_id,angle_id,voice_direction,behavior_direction,current_script,current_briefing,updated_at,created_at,ugc_personas(id,name,slug,archetype,visual_style,tone,energy),ugc_templates(id,name,slug,objective),ugc_angles(id,name,slug,angle_type)",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, project: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar projeto de criativo.",
      },
      { status: 500 },
    );
  }
}
