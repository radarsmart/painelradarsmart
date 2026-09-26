// Radar Creative AI - Creative Brain / Angle Selector
//
// Mesmo principio do framework-selector.ts: scoring deterministico sobre os
// angulos REAIS de public.ugc_angles (economia-real, descoberta-escondida,
// urgencia-curta, beneficio-direto, grupo-vip) - nenhum angulo novo e
// inventado aqui.

import type {
  AngleSelectionInput,
  ScoredOption,
  UgcAngleRow,
} from "@/lib/creative-brain/types";
import type { ProductIntelligenceCategory } from "@/lib/product-intelligence/types";

const CATEGORY_BONUS: Record<ProductIntelligenceCategory, Record<string, number>> = {
  suplementos: { "economia-real": 20, "urgencia-curta": 20 },
  perfumes: { "descoberta-escondida": 30, "economia-real": 10 },
  eletronicos: { "economia-real": 25, "beneficio-direto": 15 },
  casa: { "beneficio-direto": 25, "descoberta-escondida": 15 },
  cozinha: { "beneficio-direto": 25, "economia-real": 10 },
  ferramentas: { "beneficio-direto": 25, "economia-real": 10 },
  pet: { "beneficio-direto": 20, "descoberta-escondida": 15 },
  moda: { "descoberta-escondida": 25, "economia-real": 15 },
  beleza: { "descoberta-escondida": 25, "beneficio-direto": 15 },
  geral: { "economia-real": 15, "urgencia-curta": 10 },
};

const CATEGORY_BONUS_REASON: Record<string, string> = {
  "economia-real": "o preco/desconto e o argumento mais forte para essa categoria",
  "descoberta-escondida": "produto com apelo de novidade/descoberta",
  "urgencia-curta": "categoria onde decisao rapida ajuda a converter",
  "beneficio-direto": "produto com beneficio pratico facil de mostrar",
  "grupo-vip": "oportunidade de trazer o publico para o grupo VIP",
};

const BASE_SCORE = 20;
const HIGH_DISCOUNT_BONUS = 15;
const HIGH_DISCOUNT_THRESHOLD = 30;
const VERY_HIGH_DISCOUNT_BONUS = 15;
const VERY_HIGH_DISCOUNT_THRESHOLD = 50;
const INTELLIGENCE_BONUS_FIRST = 25;
const INTELLIGENCE_BONUS_OTHER = 10;

export function selectAngle(input: AngleSelectionInput): ScoredOption<UgcAngleRow> | null {
  const activeAngles = input.angles;
  if (!activeAngles.length) return null;

  const scored = activeAngles.map((angle) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    const categoryBonus = CATEGORY_BONUS[input.category]?.[angle.slug];
    if (categoryBonus) {
      score += categoryBonus;
      reasons.push(
        CATEGORY_BONUS_REASON[angle.slug] ?? `boa combinacao para a categoria "${input.category}"`,
      );
    }

    if (angle.slug === "economia-real" && (input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) {
      score += HIGH_DISCOUNT_BONUS;
      reasons.push("desconto acima de 30% reforca o argumento de economia");
    }

    if (angle.slug === "urgencia-curta" && (input.discountPct ?? 0) >= VERY_HIGH_DISCOUNT_THRESHOLD) {
      score += VERY_HIGH_DISCOUNT_BONUS;
      reasons.push("desconto muito alto reforca uma urgencia real");
    }

    const intelligenceIndex = input.recommendedAngleSlugs.indexOf(angle.slug);
    if (intelligenceIndex === 0) {
      score += INTELLIGENCE_BONUS_FIRST;
      reasons.push("indicado como prioridade pela analise de Product Intelligence");
    } else if (intelligenceIndex > 0) {
      score += INTELLIGENCE_BONUS_OTHER;
      reasons.push("indicado como alternativa pela analise de Product Intelligence");
    }

    return { row: angle, score, reasons } satisfies ScoredOption<UgcAngleRow>;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}
