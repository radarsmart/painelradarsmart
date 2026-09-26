// Radar Creative AI - Creative Brain / Framework Selector
//
// Scoring 100% deterministico (sem ML). Le os templates REAIS de
// public.ugc_templates (passados pelo orchestrator) e pontua cada um.
//
// IMPORTANTE - mapeamento de conceito para dado real:
// O briefing de produto descreve 6 "familias" de framework (UGC, Problema
// -> Solucao, Review, Storytelling, Oferta, Comparativo), mas o catalogo
// real em ugc_templates tem 5 slugs (oferta-direta, grupo-secreto,
// review-curto, comparacao-preco, demonstracao-curta). Como a regra do
// projeto e reaproveitar o catalogo existente e nao inventar frameworks
// novos, cada familia conceitual foi mapeada para o slug real mais
// proximo:
//   UGC / demonstracao        -> demonstracao-curta
//   Problema -> Solucao       -> demonstracao-curta (mesmo slug: cobre
//                                 tanto demonstracao quanto "mostra o
//                                 problema sendo resolvido")
//   Review                    -> review-curto
//   Storytelling / descoberta -> grupo-secreto
//   Oferta                    -> oferta-direta
//   Comparativo               -> comparacao-preco
//
// O score final soma: (a) bonus por categoria do produto, (b) bonus por
// sinais objetivos (desconto alto), e (c) bonus se o Product Intelligence
// (fase anterior) ja recomendou esse slug.

import type {
  FrameworkSelectionInput,
  ScoredOption,
  UgcTemplateRow,
} from "@/lib/creative-brain/types";
import type { ProductIntelligenceCategory } from "@/lib/product-intelligence/types";

const CATEGORY_BONUS: Record<ProductIntelligenceCategory, Record<string, number>> = {
  suplementos: { "demonstracao-curta": 30, "review-curto": 15 },
  beleza: { "demonstracao-curta": 25, "grupo-secreto": 20 },
  moda: { "demonstracao-curta": 25, "grupo-secreto": 15 },
  perfumes: { "grupo-secreto": 30, "comparacao-preco": 10 },
  eletronicos: { "review-curto": 30, "comparacao-preco": 25 },
  ferramentas: { "demonstracao-curta": 20, "comparacao-preco": 20 },
  casa: { "demonstracao-curta": 25, "oferta-direta": 10 },
  cozinha: { "demonstracao-curta": 25, "review-curto": 10 },
  pet: { "demonstracao-curta": 20, "review-curto": 15 },
  geral: { "oferta-direta": 15 },
};

const CATEGORY_BONUS_REASON: Record<string, string> = {
  "demonstracao-curta": "produto com forte apelo de demonstracao e beneficio imediato",
  "review-curto": "produto com especificacoes que se beneficiam de uma explicacao curta",
  "grupo-secreto": "produto com apelo emocional/de descoberta",
  "comparacao-preco": "produto onde o contraste de preco e argumento forte",
  "oferta-direta": "produto onde o preco/urgencia e o gatilho principal",
};

const BASE_SCORE = 20;
const DISCOUNT_BONUS = 15;
const DISCOUNT_THRESHOLD = 30;
const INTELLIGENCE_BONUS_FIRST = 25;
const INTELLIGENCE_BONUS_OTHER = 10;

export function selectFramework(
  input: FrameworkSelectionInput,
): ScoredOption<UgcTemplateRow> | null {
  const activeTemplates = input.templates;
  if (!activeTemplates.length) return null;

  const scored = activeTemplates.map((template) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    const categoryBonus = CATEGORY_BONUS[input.category]?.[template.slug];
    if (categoryBonus) {
      score += categoryBonus;
      reasons.push(
        CATEGORY_BONUS_REASON[template.slug] ??
          `boa combinacao para a categoria "${input.category}"`,
      );
    }

    if (template.slug === "oferta-direta" && (input.discountPct ?? 0) >= DISCOUNT_THRESHOLD) {
      score += DISCOUNT_BONUS;
      reasons.push("desconto alto favorece um framework de oferta direta");
    }

    const intelligenceIndex = input.recommendedFrameworkSlugs.indexOf(template.slug);
    if (intelligenceIndex === 0) {
      score += INTELLIGENCE_BONUS_FIRST;
      reasons.push("indicado como prioridade pela analise de Product Intelligence");
    } else if (intelligenceIndex > 0) {
      score += INTELLIGENCE_BONUS_OTHER;
      reasons.push("indicado como alternativa pela analise de Product Intelligence");
    }

    return { row: template, score, reasons } satisfies ScoredOption<UgcTemplateRow>;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}
