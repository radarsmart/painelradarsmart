// Radar Creative AI - Creative Brain
// O Creative Brain NAO guarda copia de frameworks/angulos/personas - ele
// consulta public.ugc_templates, public.ugc_angles e public.ugc_personas
// (ja existentes) e so decide QUAL linha real usar para uma oferta.

import type { ProductIntelligenceCategory } from "@/lib/product-intelligence/types";
import type { CharacterPreset } from "@/lib/creative-brain/character-presets";
import type { PresenterMode } from "@/lib/creative-brain/presenter-mode";
import type { CharacterDirection } from "@/lib/creative-brain/character-direction";

export type UgcTemplateRow = {
  id: string;
  slug: string;
  name: string;
  objective: string | null;
  hook_framework: string | null;
  recommended_duration: string | null;
  cta_style: string | null;
};

export type UgcAngleRow = {
  id: string;
  slug: string;
  name: string;
  angle_type: string | null;
  hook_starters: string[] | null;
  cta_options: string[] | null;
};

export type UgcPersonaRow = {
  id: string;
  slug: string;
  name: string;
  archetype: string;
  primary_use_cases: string[] | null;
  is_default: boolean;
  is_official_brand_character?: boolean | null;
};

export type ScoredOption<TRow> = {
  row: TRow;
  score: number;
  reasons: string[];
};

export type FrameworkSelectionInput = {
  category: ProductIntelligenceCategory;
  discountPct: number | null;
  recommendedFrameworkSlugs: string[];
  templates: UgcTemplateRow[];
};

export type AngleSelectionInput = {
  category: ProductIntelligenceCategory;
  discountPct: number | null;
  recommendedAngleSlugs: string[];
  angles: UgcAngleRow[];
};

export type PersonaSelectionInput = {
  category: ProductIntelligenceCategory;
  personas: UgcPersonaRow[];
};

export type CreativeBrief = {
  offerId: string;
  productIntelligenceId: string;

  objective: string;
  platform: string;
  duration: number;
  aspectRatio: string;

  targetAudience: string;
  primaryPain: string;
  primaryDesire: string;
  primaryObjection: string;
  purchaseMotivation: string;

  selectedFramework: { slug: string; name: string } | null;
  selectedAngle: { slug: string; name: string } | null;
  selectedPersona: { id: string; slug: string; name: string } | null;

  hookDirection: string;
  visualDirection: string;
  ctaDirection: string;

  // Justificativa curta e explicavel para o usuario - nunca o raciocinio
  // interno/chain-of-thought de um modelo.
  reasoningSummary: string;

  // Preenchido somente quando selectedPersona e a Garota Radar oficial
  // (is_official_brand_character = true). Direcao visual futura, nao gera
  // midia nesta fase.
  characterPreset: CharacterPreset | null;

  // Estrutura para a decisao futura de apresentador. Hoje sempre "AUTO" -
  // o algoritmo de selecao de persona atual nao foi alterado.
  presenterMode: PresenterMode;

  // Preenchidos somente quando a persona selecionada e a oficial (Garota
  // Radar). Opcionais para nao quebrar campanhas antigas (creative_brief
  // ja persistido em jsonb sem esses campos continua valido).
  characterDirection?: CharacterDirection | null;
  characterReferences?: {
    identityReferenceAssetId: string | null;
    supportReferenceAssetId: string | null;
  } | null;
};
