// Radar Creative AI - Creative Brain / Character Presets
//
// Presets visuais para a Garota Radar. Sao apenas INSTRUCOES DE DIRECAO
// (texto), nao geram midia nesta fase - servem pra alimentar o prompt de
// geracao numa fase futura (Freepik/Magnific).
//
// Identidade facial e caracteristicas principais NUNCA mudam entre
// presets (isso e o que "identity_locked" representa em ugc_personas) -
// so roupa/penteado/maquiagem/acessorios/expressao/pose/cenario variam.

import type { ProductIntelligenceCategory } from "@/lib/product-intelligence/types";

export type CharacterPreset =
  | "RADAR_DEFAULT"
  | "FITNESS"
  | "BEAUTY"
  | "FASHION"
  | "HOME"
  | "TECH"
  | "LUXURY";

export const CHARACTER_PRESETS: CharacterPreset[] = [
  "RADAR_DEFAULT",
  "FITNESS",
  "BEAUTY",
  "FASHION",
  "HOME",
  "TECH",
  "LUXURY",
];

export type CharacterPresetDirection = {
  preset: CharacterPreset;
  label: string;
  wardrobe: string;
  environment: string;
  notes: string;
};

export const CHARACTER_PRESET_DIRECTIONS: Record<CharacterPreset, CharacterPresetDirection> = {
  RADAR_DEFAULT: {
    preset: "RADAR_DEFAULT",
    label: "Radar Default",
    wardrobe: "blazer/visual alinhado a identidade Radar Smart",
    environment: "ambiente moderno, apresentacao de ofertas",
    notes: "Preset padrao quando nenhuma categoria especifica se aplica melhor.",
  },
  FITNESS: {
    preset: "FITNESS",
    label: "Fitness",
    wardrobe: "roupa esportiva",
    environment: "academia ou ambiente fitness, cabelo preso ou semi-preso",
    notes: "Para suplementos e produtos ligados a treino/bem-estar fisico.",
  },
  BEAUTY: {
    preset: "BEAUTY",
    label: "Beauty",
    wardrobe: "roupa elegante, maquiagem refinada",
    environment: "iluminacao beauty",
    notes: "Para produtos de beleza e cuidados pessoais.",
  },
  FASHION: {
    preset: "FASHION",
    label: "Fashion",
    wardrobe: "look relacionado ao produto",
    environment: "composicao editorial/social",
    notes: "Para produtos de moda e acessorios.",
  },
  HOME: {
    preset: "HOME",
    label: "Home",
    wardrobe: "casual elegante",
    environment: "ambiente residencial",
    notes: "Para produtos de casa e cozinha.",
  },
  TECH: {
    preset: "TECH",
    label: "Tech",
    wardrobe: "casual premium",
    environment: "ambiente moderno/tecnologico",
    notes: "Para eletronicos e gadgets.",
  },
  LUXURY: {
    preset: "LUXURY",
    label: "Luxury",
    wardrobe: "roupa sofisticada, penteado elegante",
    environment: "iluminacao cinematografica",
    notes: "Para perfumes e produtos de apelo emocional/premium.",
  },
};

// Mapeamento inicial categoria de Product Intelligence -> preset visual.
const CATEGORY_TO_PRESET: Record<ProductIntelligenceCategory, CharacterPreset> = {
  suplementos: "FITNESS",
  beleza: "BEAUTY",
  moda: "FASHION",
  casa: "HOME",
  cozinha: "HOME",
  eletronicos: "TECH",
  perfumes: "LUXURY",
  ferramentas: "RADAR_DEFAULT",
  pet: "RADAR_DEFAULT",
  geral: "RADAR_DEFAULT",
};

export function resolveCharacterPreset(category: ProductIntelligenceCategory): CharacterPreset {
  return CATEGORY_TO_PRESET[category] ?? "RADAR_DEFAULT";
}
