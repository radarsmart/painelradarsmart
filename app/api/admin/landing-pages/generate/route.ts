import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateLandingCopyWithGemini } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GenerateBody = {
  campaign_mode?: "product_champion" | "flash_offer" | "group_capture";
  title?: string;
  marketplace?: string;
  headline?: string;
  subheadline?: string;
  product_title?: string;
  product_price?: string;
  product_old_price?: string;
  affiliate_url?: string;
  site_url?: string;
  group_url?: string;
  badge_text?: string;
  primary_cta_label?: string;
  group_cta_label?: string;
  site_cta_label?: string;
  price_note?: string;
  benefits?: string;
  technical_details?: string;
  social_proof?: string;
  disclaimer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function getCampaignModeLabel(mode: string) {
  if (mode === "flash_offer") return "oferta relâmpago";
  if (mode === "group_capture") return "captação para grupo";
  return "produto campeão";
}

function buildPrompt(body: GenerateBody) {
  const title = toText(body.title);
  const productTitle = toText(body.product_title) || title;
  const marketplace = toText(body.marketplace) || "Marketplace";
  const currentPrice = toText(body.product_price);
  const oldPrice = toText(body.product_old_price);
  const campaignMode = toText(body.campaign_mode) || "product_champion";

  return [
    "Crie a copy de uma landing page de alta conversão para tráfego pago.",
    "Objetivo principal: clique no link de compra.",
    "Objetivo secundário: entrada no grupo do Radar Smart.",
    `Tipo de campanha: ${getCampaignModeLabel(campaignMode)}`,
    "Contexto da campanha:",
    `- Título interno atual: ${title || "não informado"}`,
    `- Produto: ${productTitle || "não informado"}`,
    `- Marketplace: ${marketplace}`,
    `- Preço atual: ${currentPrice || "não informado"}`,
    `- Preço antigo: ${oldPrice || "não informado"}`,
    `- Badge atual: ${toText(body.badge_text) || "não informado"}`,
    `- CTA principal atual: ${toText(body.primary_cta_label) || "não informado"}`,
    `- CTA grupo atual: ${toText(body.group_cta_label) || "não informado"}`,
    `- CTA site atual: ${toText(body.site_cta_label) || "não informado"}`,
    `- UTM source: ${toText(body.utm_source) || "não informado"}`,
    `- UTM medium: ${toText(body.utm_medium) || "não informado"}`,
    `- UTM campaign: ${toText(body.utm_campaign) || "não informado"}`,
    `- UTM content: ${toText(body.utm_content) || "não informado"}`,
    "",
    "Instruções de copy:",
    "- Priorize dor, benefício, segurança e praticidade.",
    "- Use frases curtas, claras e fortes para mobile.",
    "- Headline e subheadline devem funcionar acima da dobra.",
    "- Benefícios: 4 a 6 linhas curtas.",
    "- Detalhes técnicos: 4 a 6 linhas curtas.",
    "- Prova social: use formulações prudentes se não houver dados concretos.",
    "- O disclaimer deve ser juridicamente prudente.",
    "- O price_note deve induzir ação sem mentir ou prometer algo que não foi informado.",
    "- creative_angle deve resumir o principal ângulo de venda da campanha.",
    "- ad_primary_text deve ser um texto principal para anúncio pago, em 2 a 4 linhas.",
    "- ad_headline deve ser curto e forte.",
    "- ad_description deve complementar o anúncio com clareza.",
    "",
    "Retorne campos prontos para preencher o formulário da landing page.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY não configurada no servidor." },
        { status: 500 },
      );
    }

    const body = (await req.json()) as GenerateBody;
    const hasEnoughContext = [body.title, body.product_title, body.headline].some(
      (value) => toText(value).length > 0,
    );

    if (!hasEnoughContext) {
      return NextResponse.json(
        {
          error:
            "Preencha ao menos o título interno, título do produto ou headline antes de usar a IA.",
        },
        { status: 400 },
      );
    }

    const generated = await generateLandingCopyWithGemini({
      apiKey,
      model,
      prompt: buildPrompt(body),
    });

    return NextResponse.json({ generated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar copy da landing page." },
      { status: 500 },
    );
  }
}
