import { supabaseAdmin } from "@/lib/supabase";
import {
  extractResponseText,
  type OpenAIResponsesApiResponse,
} from "@/lib/tiktok-engine/pipeline";

// "Modulo 1 — Inteligencia do Produto": antes disso, escolher persona/
// template/angulo pra um video era 100% manual (selects vazios no admin).
// Essa funcao pergunta pra IA, dado o produto, qual das opcoes REAIS que ja
// existem no banco (nao inventadas) faz mais sentido — e o admin ainda pode
// trocar manualmente depois, isso so pre-seleciona.

const OPENAI_MODEL = "gpt-4o-mini";

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel ${name} ausente.`);
  return value;
}

export type ProductClassification = {
  angleType: string | null;
  audienceDescriptor: string;
  recommendedPersonaSlug: string | null;
  recommendedTemplateSlug: string | null;
  recommendedAngleSlug: string | null;
  reasoning: string;
  confidence: "low" | "medium" | "high";
};

export type ClassifyProductInput = {
  title: string;
  price: number;
  category?: string | null;
  marketplace?: string | null;
  discountPct?: number | null;
};

type SelectionOption = {
  slug: string;
  name: string;
  extra?: string | null;
};

async function loadSelectionOptions(): Promise<{
  personas: SelectionOption[];
  templates: SelectionOption[];
  angles: SelectionOption[];
  angleTypes: string[];
}> {
  const [personasRes, templatesRes, anglesRes] = await Promise.all([
    supabaseAdmin
      .from("ugc_personas")
      .select("slug,name,archetype")
      .eq("is_active", true),
    supabaseAdmin
      .from("ugc_templates")
      .select("slug,name,objective")
      .eq("is_active", true),
    supabaseAdmin
      .from("ugc_angles")
      .select("slug,name,angle_type")
      .eq("is_active", true),
  ]);

  if (personasRes.error) throw new Error(`Falha ao listar personas: ${personasRes.error.message}`);
  if (templatesRes.error) throw new Error(`Falha ao listar templates: ${templatesRes.error.message}`);
  if (anglesRes.error) throw new Error(`Falha ao listar angulos: ${anglesRes.error.message}`);

  const personas = (personasRes.data ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    extra: row.archetype ? String(row.archetype) : null,
  }));
  const templates = (templatesRes.data ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    extra: row.objective ? String(row.objective) : null,
  }));
  const angles = (anglesRes.data ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    extra: row.angle_type ? String(row.angle_type) : null,
  }));

  const angleTypes = Array.from(
    new Set(angles.map((angle) => angle.extra).filter((value): value is string => Boolean(value))),
  );

  return { personas, templates, angles, angleTypes };
}

export async function classifyProduct(
  input: ClassifyProductInput,
): Promise<ProductClassification> {
  const openAiKey = requiredEnv("OPENAI_API_KEY");
  const { personas, templates, angles, angleTypes } = await loadSelectionOptions();

  if (!personas.length || !templates.length || !angles.length) {
    throw new Error(
      "Nao ha personas/templates/angulos ativos cadastrados pra classificar o produto.",
    );
  }

  const personaSlugs = personas.map((item) => item.slug);
  const templateSlugs = templates.map((item) => item.slug);
  const angleSlugs = angles.map((item) => item.slug);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      angle_type: { type: "string", enum: angleTypes },
      audience_descriptor: { type: "string" },
      recommended_persona_slug: { type: "string", enum: personaSlugs },
      recommended_template_slug: { type: "string", enum: templateSlugs },
      recommended_angle_slug: { type: "string", enum: angleSlugs },
      reasoning: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: [
      "angle_type",
      "audience_descriptor",
      "recommended_persona_slug",
      "recommended_template_slug",
      "recommended_angle_slug",
      "reasoning",
      "confidence",
    ],
  };

  const system =
    "Voce e um diretor de marketing de performance especialista em video curto " +
    "(TikTok/Reels) pra e-commerce brasileiro. Dado um produto real, escolha a " +
    "combinacao de persona, template e angulo de marketing que tem mais chance " +
    "de vender esse produto especifico — escolha SOMENTE entre as opcoes reais " +
    "listadas (nunca invente um slug que nao esteja na lista). Descreva tambem " +
    "o publico-alvo em uma frase curta (ex: 'homens 18-30 que treinam na "+
    "academia') e explique em 1-2 frases por que essa combinacao faz sentido " +
    "pra esse produto.";

  const user = JSON.stringify({
    produto: {
      titulo: input.title,
      preco: input.price,
      categoria: input.category ?? null,
      loja: input.marketplace ?? null,
      desconto_pct: input.discountPct ?? null,
    },
    personas_disponiveis: personas,
    templates_disponiveis: templates,
    angulos_disponiveis: angles,
  });

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "product_classification",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI falhou (${res.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as OpenAIResponsesApiResponse;
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI retornou resposta vazia pra classificacao.");

  const parsed = JSON.parse(text) as {
    angle_type?: string;
    audience_descriptor?: string;
    recommended_persona_slug?: string;
    recommended_template_slug?: string;
    recommended_angle_slug?: string;
    reasoning?: string;
    confidence?: string;
  };

  // Defesa extra alem do enum do schema — nunca deixa passar um slug que
  // nao existe de verdade no banco.
  const personaSlug = personaSlugs.includes(parsed.recommended_persona_slug ?? "")
    ? (parsed.recommended_persona_slug as string)
    : null;
  const templateSlug = templateSlugs.includes(parsed.recommended_template_slug ?? "")
    ? (parsed.recommended_template_slug as string)
    : null;
  const angleSlug = angleSlugs.includes(parsed.recommended_angle_slug ?? "")
    ? (parsed.recommended_angle_slug as string)
    : null;

  return {
    angleType: angleTypes.includes(parsed.angle_type ?? "") ? (parsed.angle_type as string) : null,
    audienceDescriptor: String(parsed.audience_descriptor ?? "").trim(),
    recommendedPersonaSlug: personaSlug,
    recommendedTemplateSlug: templateSlug,
    recommendedAngleSlug: angleSlug,
    reasoning: String(parsed.reasoning ?? "").trim(),
    confidence: (["low", "medium", "high"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "medium") as "low" | "medium" | "high",
  };
}
