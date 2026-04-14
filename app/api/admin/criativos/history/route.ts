import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeneratedScriptPayload = {
  hook?: string;
  body?: string;
  cta?: string;
  full_text?: string;
  tone?: string;
  part1?: string;
  part2?: string;
  part3?: string;
};

type BriefingPayload = {
  angle?: string;
  recommendedFormat?: string;
  idealDuration?: string;
  hookStyle?: string;
  scenePlan?: string[];
  checklist?: string[];
};

type WhatsAppCopyPayload = {
  hook?: string;
  short?: string;
  medium?: string;
  long?: string;
  imageUrl?: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item)).filter(Boolean);
}

function normalizeGeneratedScript(value: unknown): GeneratedScriptPayload {
  const script = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    hook: toText(script.hook),
    body: toText(script.body),
    cta: toText(script.cta),
    full_text: toText(script.full_text),
    tone: toText(script.tone),
    part1: toText(script.part1),
    part2: toText(script.part2),
    part3: toText(script.part3),
  };
}

function normalizeBriefing(value: unknown): BriefingPayload {
  const briefing = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    angle: toText(briefing.angle),
    recommendedFormat: toText(briefing.recommendedFormat),
    idealDuration: toText(briefing.idealDuration),
    hookStyle: toText(briefing.hookStyle),
    scenePlan: sanitizeStringArray(briefing.scenePlan),
    checklist: sanitizeStringArray(briefing.checklist),
  };
}

function normalizeWhatsAppCopy(value: unknown): WhatsAppCopyPayload {
  const copy = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    hook: toText(copy.hook),
    short: toText(copy.short),
    medium: toText(copy.medium),
    long: toText(copy.long),
    imageUrl: toText(copy.imageUrl ?? copy.image_url),
  };
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("ugc_creatives")
      .select(
        "id,campaign_name,ugc_type,voice_key,title,marketplace,category,product_url,price,original_price,generated_script,briefing,whatsapp_copy,created_at,offer_id,landing_page_id,project_id,persona_id,template_id,angle_id,voice_direction,behavior_direction,created_by_email",
      )
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ creatives: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao carregar histórico de criativos.",
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

    const campaignName = toText(body.campaignName);
    const ugcType = toText(body.ugcType);
    const voiceKey = toText(body.voiceKey);
    const title = toText(body.title);
    const productUrl = toText(body.productUrl);
    const script = normalizeGeneratedScript(body.script);
    const briefing = normalizeBriefing(body.briefing);
    const whatsappCopy = normalizeWhatsAppCopy(body.whatsappCopy);

    const hasScript = Boolean(script.full_text);
    const hasWhatsAppCopy = Boolean(whatsappCopy.short || whatsappCopy.medium || whatsappCopy.long);

    if (!campaignName || !ugcType || !voiceKey || !title || !productUrl || (!hasScript && !hasWhatsAppCopy)) {
      return NextResponse.json(
        {
          error:
            "Campanha, modelo, voz, título, URL do produto e um roteiro ou copy são obrigatórios para salvar no histórico.",
        },
        { status: 400 },
      );
    }

    const payload = {
      offer_id: toText(body.offerId) || null,
      landing_page_id: toText(body.landingPageId) || null,
      project_id: toText(body.projectId) || null,
      persona_id: toText(body.personaId) || null,
      template_id: toText(body.templateId) || null,
      angle_id: toText(body.angleId) || null,
      voice_direction:
        body.voiceDirection && typeof body.voiceDirection === "object" ? body.voiceDirection : {},
      behavior_direction:
        body.behaviorDirection && typeof body.behaviorDirection === "object"
          ? body.behaviorDirection
          : {},
      campaign_name: campaignName,
      ugc_type: ugcType,
      voice_key: voiceKey,
      title,
      marketplace: toText(body.marketplace) || null,
      category: toText(body.category) || null,
      product_url: productUrl,
      price: toNumberOrNull(body.price),
      original_price: toNumberOrNull(body.originalPrice),
      generated_script: script,
      briefing,
      whatsapp_copy: whatsappCopy,
      source_context:
        body.sourceContext && typeof body.sourceContext === "object"
          ? body.sourceContext
          : {},
      created_by_user_id: adminGuard.userId,
      created_by_email: adminGuard.email,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("ugc_creatives")
      .insert(payload)
      .select(
        "id,campaign_name,ugc_type,voice_key,title,marketplace,category,product_url,price,original_price,generated_script,briefing,whatsapp_copy,created_at,offer_id,landing_page_id,project_id,persona_id,template_id,angle_id,voice_direction,behavior_direction,created_by_email",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, creative: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao salvar criativo no histórico.",
      },
      { status: 500 },
    );
  }
}
