import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateUGCScript } from "@/lib/ugc/script-generator";
import type {
  UGCMarketingAngle,
  UGCBehaviorDirection,
  UGCOfferContext,
  UGCPersonaProfile,
  UGCTemplateProfile,
  UGCType,
  UGCVoiceDirection,
} from "@/lib/ugc/types";
import { UGC_VOICES, type VoiceKey } from "@/lib/ugc/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GenerateCreativeBody = {
  projectId?: string;
  personaId?: string;
  templateId?: string;
  angleId?: string;
  campaignName?: string;
  ugcType?: UGCType;
  voice?: VoiceKey;
  title?: string;
  marketplace?: string;
  category?: string;
  productUrl?: string;
  objective?: string;
  price?: string | number;
  originalPrice?: string | number;
  voiceDirection?: UGCVoiceDirection;
  behaviorDirection?: UGCBehaviorDirection;
};

type CreativeBriefing = {
  angle: string;
  recommendedFormat: string;
  idealDuration: string;
  hookStyle: string;
  scenePlan: string[];
  checklist: string[];
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isVoiceKey(value: string): value is VoiceKey {
  return value in UGC_VOICES;
}

function isUgcType(value: string): value is UGCType {
  return value === "model-a" || value === "model-b" || value === "model-c";
}

function normalizeVoiceDirection(value: unknown): UGCVoiceDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    pace: ["calm", "balanced", "fast"].includes(toText(raw.pace))
      ? (toText(raw.pace) as UGCVoiceDirection["pace"])
      : "balanced",
    pauseStyle: ["clean", "natural", "fragmented"].includes(toText(raw.pauseStyle))
      ? (toText(raw.pauseStyle) as UGCVoiceDirection["pauseStyle"])
      : "natural",
    emotionalIntensity: ["low", "medium", "high"].includes(toText(raw.emotionalIntensity))
      ? (toText(raw.emotionalIntensity) as UGCVoiceDirection["emotionalIntensity"])
      : "medium",
    urgency: ["low", "medium", "high"].includes(toText(raw.urgency))
      ? (toText(raw.urgency) as UGCVoiceDirection["urgency"])
      : "medium",
    credibility: ["low", "medium", "high"].includes(toText(raw.credibility))
      ? (toText(raw.credibility) as UGCVoiceDirection["credibility"])
      : "high",
    ctaPressure: ["soft", "balanced", "strong"].includes(toText(raw.ctaPressure))
      ? (toText(raw.ctaPressure) as UGCVoiceDirection["ctaPressure"])
      : "balanced",
  };
}

function normalizeBehaviorDirection(value: unknown): UGCBehaviorDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    eyeContact: ["soft", "balanced", "strong"].includes(toText(raw.eyeContact))
      ? (toText(raw.eyeContact) as UGCBehaviorDirection["eyeContact"])
      : "balanced",
    gestureIntensity: ["low", "medium", "high"].includes(toText(raw.gestureIntensity))
      ? (toText(raw.gestureIntensity) as UGCBehaviorDirection["gestureIntensity"])
      : "medium",
    smileLevel: ["low", "medium", "high"].includes(toText(raw.smileLevel))
      ? (toText(raw.smileLevel) as UGCBehaviorDirection["smileLevel"])
      : "low",
    imperfectionLevel: ["low", "medium", "high"].includes(toText(raw.imperfectionLevel))
      ? (toText(raw.imperfectionLevel) as UGCBehaviorDirection["imperfectionLevel"])
      : "medium",
    cameraEnergy: ["calm", "balanced", "dynamic"].includes(toText(raw.cameraEnergy))
      ? (toText(raw.cameraEnergy) as UGCBehaviorDirection["cameraEnergy"])
      : "balanced",
  };
}

async function loadPersona(personaId: string): Promise<UGCPersonaProfile | null> {
  if (!personaId) return null;

  const { data, error } = await supabaseAdmin
    .from("ugc_personas")
    .select(
      "id,slug,name,archetype,gender_presentation,age_range,visual_style,tone,energy,accent,primary_use_cases,provider,provider_avatar_id,provider_voice_id,avatar_image_url,behavior_profile,camera_profile,is_default",
    )
    .eq("id", personaId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    archetype: data.archetype,
    genderPresentation: data.gender_presentation,
    ageRange: data.age_range,
    visualStyle: data.visual_style,
    tone: data.tone,
    energy: data.energy,
    accent: data.accent,
    primaryUseCases: Array.isArray(data.primary_use_cases)
      ? data.primary_use_cases.map((item) => toText(item)).filter(Boolean)
      : [],
    provider: data.provider,
    providerAvatarId: data.provider_avatar_id,
    providerVoiceId: data.provider_voice_id,
    avatarImageUrl: data.avatar_image_url,
    behaviorProfile:
      data.behavior_profile && typeof data.behavior_profile === "object"
        ? (data.behavior_profile as Record<string, unknown>)
        : {},
    cameraProfile:
      data.camera_profile && typeof data.camera_profile === "object"
        ? (data.camera_profile as Record<string, unknown>)
        : {},
    isDefault: Boolean(data.is_default),
  };
}

async function loadAngle(angleId: string): Promise<UGCMarketingAngle | null> {
  if (!angleId) return null;

  const { data, error } = await supabaseAdmin
    .from("ugc_angles")
    .select(
      "id,slug,name,angle_type,description,pain_points,desire_points,proof_points,hook_starters,cta_options",
    )
    .eq("id", angleId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    angleType: data.angle_type,
    description: data.description,
    painPoints: Array.isArray(data.pain_points) ? data.pain_points.map((item) => toText(item)).filter(Boolean) : [],
    desirePoints: Array.isArray(data.desire_points)
      ? data.desire_points.map((item) => toText(item)).filter(Boolean)
      : [],
    proofPoints: Array.isArray(data.proof_points) ? data.proof_points.map((item) => toText(item)).filter(Boolean) : [],
    hookStarters: Array.isArray(data.hook_starters)
      ? data.hook_starters.map((item) => toText(item)).filter(Boolean)
      : [],
    ctaOptions: Array.isArray(data.cta_options) ? data.cta_options.map((item) => toText(item)).filter(Boolean) : [],
  };
}

async function loadTemplate(templateId: string): Promise<UGCTemplateProfile | null> {
  if (!templateId) return null;

  const { data, error } = await supabaseAdmin
    .from("ugc_templates")
    .select(
      "id,slug,name,objective,description,hook_framework,structure_steps,recommended_duration,cta_style,editing_notes",
    )
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    objective: data.objective,
    description: data.description,
    hookFramework: data.hook_framework,
    structureSteps: Array.isArray(data.structure_steps)
      ? data.structure_steps.map((item) => toText(item)).filter(Boolean)
      : [],
    recommendedDuration: data.recommended_duration,
    ctaStyle: data.cta_style,
    editingNotes:
      data.editing_notes && typeof data.editing_notes === "object"
        ? (data.editing_notes as Record<string, unknown>)
        : {},
  };
}

function buildBriefing(params: {
  ugcType: UGCType;
  campaignName: string;
  marketplace: string;
  productTitle: string;
  price: number;
  voiceDirection: UGCVoiceDirection;
  behaviorDirection: UGCBehaviorDirection;
}): CreativeBriefing {
  const baseChecklist = [
    "Gravar em formato vertical 9:16, com enquadramento limpo e boa iluminação.",
    "Mostrar o produto nos 3 primeiros segundos para reduzir queda no anúncio.",
    "Reforçar o preço e o CTA final de forma clara no último bloco.",
    "Evitar mencionar o marketplace; usar apenas site, app ou Radar Smart.",
    `Direcao de voz: ritmo ${params.voiceDirection.pace}, pausas ${params.voiceDirection.pauseStyle}, urgencia ${params.voiceDirection.urgency}.`,
    `Direcao comportamental: contato visual ${params.behaviorDirection.eyeContact}, gestos ${params.behaviorDirection.gestureIntensity}, imperfeicao ${params.behaviorDirection.imperfectionLevel}.`,
  ];

  if (params.ugcType === "model-c") {
    return {
      angle: `Demonstração prática com apoio de tela para a campanha "${params.campaignName || params.productTitle}".`,
      recommendedFormat: "Vídeo vertical com tela do Radar Smart + narração estilo creator.",
      idealDuration: "12 a 15 segundos",
      hookStyle: "Reação rápida + prova visual imediata do produto em uso.",
      scenePlan: [
        "Cena 1: abertura surpresa com a home ou oferta do Radar Smart na tela.",
        "Cena 2: close no produto, uso real ou benefício principal em poucos segundos.",
        `Cena 3: reforço do preço em R$ ${params.price.toFixed(2).replace(".", ",")} e CTA para entrar no Radar Smart.`,
      ],
      checklist: [
        ...baseChecklist,
        "Capturar screenshot ou gravação de tela do Radar Smart para usar como prova visual.",
        "Sincronizar a narração com cortes rápidos para manter retenção.",
      ],
    };
  }

  if (params.ugcType === "model-b") {
    return {
      angle: `UGC de review curto com foco em benefício e praticidade no ${params.marketplace}.`,
      recommendedFormat: "Vídeo vertical com creator em quadro, sem excesso de elementos na tela.",
      idealDuration: "15 a 20 segundos",
      hookStyle: "Dor clara no início + frase curta de curiosidade.",
      scenePlan: [
        "Cena 1: dor principal e abertura direta olhando para a câmera.",
        "Cena 2: benefício prático com apoio do produto ou imagem na mão.",
        "Cena 3: CTA final para clicar no link e acompanhar ofertas no Radar Smart.",
      ],
      checklist: [
        ...baseChecklist,
        "Usar legenda grande e contraste alto para leitura no celular.",
        "Manter o ritmo de fala natural, sem parecer locução publicitária.",
      ],
    };
  }

  return {
    angle: `UGC direto de conversão com foco em produto campeão no ${params.marketplace}.`,
    recommendedFormat: "Vídeo vertical estilo selfie, com creator falando diretamente com a câmera.",
    idealDuration: "10 a 15 segundos",
    hookStyle: "Choque inicial com preço ou benefício principal.",
    scenePlan: [
      "Cena 1: reação espontânea e menção da dor ou oportunidade.",
      "Cena 2: mostrar o produto e destacar o principal benefício.",
      "Cena 3: reforçar urgência, preço e CTA para entrar no Radar Smart.",
    ],
    checklist: [
      ...baseChecklist,
      "Manter fundo limpo e áudio sem ruído para parecer conteúdo orgânico de alta qualidade.",
      "Preparar uma capa estática com headline curta para reaproveitar no anúncio.",
    ],
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as GenerateCreativeBody;
    const title = toText(body.title);
    const marketplace = toText(body.marketplace);
    const category = toText(body.category);
    const productUrl = toText(body.productUrl);
    const campaignName = toText(body.campaignName);
    const objective = toText(body.objective) || "conversion";
    const personaId = toText(body.personaId);
    const templateId = toText(body.templateId);
    const angleId = toText(body.angleId);
    const voiceDirection = normalizeVoiceDirection(body.voiceDirection);
    const behaviorDirection = normalizeBehaviorDirection(body.behaviorDirection);
    const price = toNumber(body.price);
    const originalPrice = toNumber(body.originalPrice);
    const requestedVoice = toText(body.voice);
    const selectedVoice: VoiceKey = isVoiceKey(requestedVoice) ? requestedVoice : "mateus";
    const requestedUgcType = toText(body.ugcType);
    const ugcType: UGCType = isUgcType(requestedUgcType) ? requestedUgcType : "model-a";
    const [persona, template, angle] = await Promise.all([
      loadPersona(personaId),
      loadTemplate(templateId),
      loadAngle(angleId),
    ]);

    if (!title || !marketplace || !productUrl || price === null || price <= 0) {
      return NextResponse.json(
        {
          error:
            "Preencha título do produto, marketplace, URL do produto e preço atual antes de gerar o roteiro.",
        },
        { status: 400 },
      );
    }

    const discountPct =
      originalPrice && originalPrice > price
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : undefined;

    const offerContext: UGCOfferContext = {
      title,
      price,
      originalPrice: originalPrice ?? undefined,
      marketplace,
      category: category || undefined,
      discountPct,
      productUrl,
      campaignName: campaignName || undefined,
      objective,
      persona: persona ?? undefined,
      template: template ?? undefined,
      angle: angle ?? undefined,
      voiceDirection,
      behaviorDirection,
    };

    const script = await generateUGCScript(offerContext);
    const voice = UGC_VOICES[selectedVoice];
    const briefing = buildBriefing({
      ugcType,
      campaignName: campaignName || title,
      marketplace,
      productTitle: title,
      price,
      voiceDirection,
      behaviorDirection,
    });

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      input: {
        projectId: toText(body.projectId) || null,
        personaId: persona?.id ?? null,
        templateId: template?.id ?? null,
        angleId: angle?.id ?? null,
        campaignName,
        ugcType,
        marketplace,
        category,
        objective,
        voiceDirection,
        behaviorDirection,
      },
      persona,
      template,
      angle,
      voice: {
        key: selectedVoice,
        ...voice,
      },
      script,
      briefing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar roteiro de criativo com IA.",
      },
      { status: 500 },
    );
  }
}
