// Radar Creative AI - Creative Brain
//
// Fluxo: offer -> product_intelligence -> angulo -> framework -> persona
// -> CreativeBrief. Le sempre o catalogo REAL de public.ugc_templates,
// public.ugc_angles e public.ugc_personas - nada e hardcoded aqui.
//
// Esta camada NAO gera roteiro nem midia. `hookDirection`, `visualDirection`
// e `ctaDirection` sao direcoes curtas (de onde puxar o roteiro depois),
// nao o texto final do criativo.

import { supabaseAdmin } from "@/lib/supabase";
import { getLatestProductIntelligence } from "@/lib/product-intelligence/repository";
import { selectFramework } from "@/lib/creative-brain/framework-selector";
import { selectAngle } from "@/lib/creative-brain/angle-selector";
import { resolveCharacterPreset } from "@/lib/creative-brain/character-presets";
import { resolvePresenterMode } from "@/lib/creative-brain/presenter-mode";
import { resolveCharacterDirection } from "@/lib/creative-brain/character-direction";
import { selectCharacterReferencePair } from "@/lib/brand-character/character-pack";
import type {
  CreativeBrief,
  UgcAngleRow,
  UgcPersonaRow,
  UgcTemplateRow,
} from "@/lib/creative-brain/types";

const DEFAULT_DURATION_SECONDS = 20;
const DEFAULT_ASPECT_RATIO = "9:16";
const DEFAULT_PLATFORM = "tiktok";

type OfferRow = {
  id: string;
  title: string | null;
  category: string | null;
  discount_pct: number | null;
};

export class CreativeBrainError extends Error {}

function parseDurationSeconds(label: string | null): number {
  if (!label) return DEFAULT_DURATION_SECONDS;
  const matches = label.match(/\d+/g)?.map(Number) ?? [];
  if (!matches.length) return DEFAULT_DURATION_SECONDS;
  if (matches.length === 1) return matches[0];
  return Math.round((matches[0] + matches[1]) / 2);
}

async function fetchOffer(offerId: string): Promise<OfferRow> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,category,discount_pct")
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw new CreativeBrainError(`Falha ao buscar oferta: ${error.message}`);
  if (!data) throw new CreativeBrainError("Oferta nao encontrada.");
  return data as OfferRow;
}

async function fetchActiveCatalog(): Promise<{
  templates: UgcTemplateRow[];
  angles: UgcAngleRow[];
  personas: UgcPersonaRow[];
}> {
  const [templatesRes, anglesRes, personasRes] = await Promise.all([
    supabaseAdmin
      .from("ugc_templates")
      .select("id,slug,name,objective,hook_framework,recommended_duration,cta_style")
      .eq("is_active", true),
    supabaseAdmin
      .from("ugc_angles")
      .select("id,slug,name,angle_type,hook_starters,cta_options")
      .eq("is_active", true),
    supabaseAdmin
      .from("ugc_personas")
      .select("id,slug,name,archetype,primary_use_cases,is_default,is_official_brand_character")
      .eq("is_active", true),
  ]);

  if (templatesRes.error) {
    throw new CreativeBrainError(`Falha ao listar templates: ${templatesRes.error.message}`);
  }
  if (anglesRes.error) {
    throw new CreativeBrainError(`Falha ao listar angulos: ${anglesRes.error.message}`);
  }
  if (personasRes.error) {
    throw new CreativeBrainError(`Falha ao listar personas: ${personasRes.error.message}`);
  }

  return {
    templates: (templatesRes.data ?? []) as UgcTemplateRow[],
    angles: (anglesRes.data ?? []) as UgcAngleRow[],
    personas: (personasRes.data ?? []) as UgcPersonaRow[],
  };
}

const PERSONA_CATEGORY_KEYWORDS: Record<string, string[]> = {
  suplementos: ["fitness", "academia", "musculacao"],
  beleza: ["beleza", "cuidado"],
  moda: ["moda"],
  perfumes: ["beleza", "moda"],
  eletronicos: ["tecnologia", "gadgets", "eletronicos"],
  casa: ["casa", "utilidades", "organizacao"],
  cozinha: ["casa", "utilidades"],
  ferramentas: ["ferramentas", "casa", "utilidades"],
  pet: ["casa", "utilidades"],
  geral: ["ofertas", "promocoes"],
};

const OFFICIAL_PERSONA_BONUS = 20;
const DEFAULT_PERSONA_BONUS = 5;

function selectPersona(
  category: string,
  personas: UgcPersonaRow[],
): { row: UgcPersonaRow; reasons: string[] } | null {
  if (!personas.length) return null;

  const keywords = PERSONA_CATEGORY_KEYWORDS[category] ?? PERSONA_CATEGORY_KEYWORDS.geral;

  const scored = personas.map((persona) => {
    let score = 0;
    const reasons: string[] = [];
    const useCases = persona.primary_use_cases ?? [];

    const overlap = useCases.filter((useCase) => keywords.includes(useCase));
    if (overlap.length > 0) {
      score += overlap.length * 15;
      reasons.push(`atua nos temas "${overlap.join(", ")}", alinhados a categoria "${category}"`);
    }

    if (persona.is_official_brand_character) {
      score += OFFICIAL_PERSONA_BONUS;
      reasons.push("e a garota-propaganda oficial da Radar Smart");
    }

    if (persona.is_default) {
      score += DEFAULT_PERSONA_BONUS;
      reasons.push("persona padrao do catalogo");
    }

    return { row: persona, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  return { row: best.row, reasons: best.reasons };
}

function buildReasoningSummary(
  frameworkReasons: string[],
  angleReasons: string[],
  frameworkName: string,
  angleName: string,
): string {
  const frameworkReason = frameworkReasons[0] ?? "melhor combinacao disponivel para o produto";
  const angleReason = angleReasons[0] ?? "melhor combinacao disponivel para o produto";
  return (
    `Framework "${frameworkName}" selecionado porque ${frameworkReason}. ` +
    `Angulo "${angleName}" selecionado porque ${angleReason}.`
  );
}

/**
 * Monta o CreativeBrief de uma oferta a partir da ultima analise de
 * Product Intelligence disponivel. Nao gera roteiro, midia ou salva nada -
 * quem chama decide o que fazer com o brief (ex: persistir em
 * creative_campaigns).
 */
export async function buildCreativeBrief(offerId: string): Promise<CreativeBrief> {
  const [offer, intelligence, catalog] = await Promise.all([
    fetchOffer(offerId),
    getLatestProductIntelligence(offerId),
    fetchActiveCatalog(),
  ]);

  if (!intelligence) {
    throw new CreativeBrainError(
      "Nenhuma analise de Product Intelligence encontrada para esta oferta. Rode a analise antes de montar o brief.",
    );
  }

  const framework = selectFramework({
    category: intelligence.category,
    discountPct: offer.discount_pct,
    recommendedFrameworkSlugs: intelligence.recommendedFrameworks.map((item) => item.slug),
    templates: catalog.templates,
  });

  const angle = selectAngle({
    category: intelligence.category,
    discountPct: offer.discount_pct,
    recommendedAngleSlugs: intelligence.recommendedAngles.map((item) => item.slug),
    angles: catalog.angles,
  });

  if (!framework) {
    throw new CreativeBrainError("Nenhum template ativo em ugc_templates para selecionar.");
  }
  if (!angle) {
    throw new CreativeBrainError("Nenhum angulo ativo em ugc_angles para selecionar.");
  }

  const persona = selectPersona(intelligence.category, catalog.personas);
  const isOfficialCharacterSelected = Boolean(persona?.row.is_official_brand_character);
  const characterPresetValue = isOfficialCharacterSelected
    ? resolveCharacterPreset(intelligence.category)
    : null;
  const presenterModeValue = resolvePresenterMode();

  let characterDirection: CreativeBrief["characterDirection"] = null;
  let characterReferences: CreativeBrief["characterReferences"] = null;

  if (isOfficialCharacterSelected && persona && characterPresetValue) {
    characterDirection = resolveCharacterDirection(
      framework.row.slug,
      persona.row.slug,
      characterPresetValue,
      presenterModeValue,
    );

    const pair = await selectCharacterReferencePair({
      characterSlug: persona.row.slug,
      expression: characterDirection.expression,
      pose: characterDirection.pose,
      shot: characterDirection.shot,
    });

    characterReferences = {
      identityReferenceAssetId: pair.identityReference?.id ?? null,
      supportReferenceAssetId: pair.supportReference?.id ?? null,
    };
  }

  return {
    offerId,
    productIntelligenceId: intelligence.id,

    objective: "conversion",
    platform: DEFAULT_PLATFORM,
    duration: parseDurationSeconds(framework.row.recommended_duration),
    aspectRatio: DEFAULT_ASPECT_RATIO,

    targetAudience: intelligence.targetAudience.description,
    primaryPain: intelligence.painPoints[0] ?? "",
    primaryDesire: intelligence.desires[0] ?? "",
    primaryObjection: intelligence.objections[0] ?? "",
    purchaseMotivation: intelligence.purchaseMotivations[0] ?? "",

    selectedFramework: { slug: framework.row.slug, name: framework.row.name },
    selectedAngle: { slug: angle.row.slug, name: angle.row.name },
    selectedPersona: persona
      ? { id: persona.row.id, slug: persona.row.slug, name: persona.row.name }
      : null,

    hookDirection: angle.row.hook_starters?.[0] ?? framework.row.hook_framework ?? "",
    visualDirection: framework.row.hook_framework ?? "",
    ctaDirection: angle.row.cta_options?.[0] ?? framework.row.cta_style ?? "",

    reasoningSummary: buildReasoningSummary(
      framework.reasons,
      angle.reasons,
      framework.row.name,
      angle.row.name,
    ),

    characterPreset: characterPresetValue,
    presenterMode: presenterModeValue,
    characterDirection,
    characterReferences,
  };
}
