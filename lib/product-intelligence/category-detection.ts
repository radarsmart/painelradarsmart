// Radar Creative AI - Product Intelligence - Category Detection V2
//
// Substitui a logica antiga de analyze.ts#detectCategory (primeira
// categoria cujo keyword bate, ordem de insercao decide empates) por uma
// deteccao baseada em EVIDENCIA PONDERADA - o bug real que motivou esta
// tarefa (achado pelo Product Intelligence Grounding V1): "colageno" e um
// sinal FRACO (aparece tanto em skincare quanto em suplementos ingeriveis)
// e nao deveria, sozinho, decidir a categoria de um produto cujo titulo tem
// sinais FORTES e especificos de outra categoria ("facial", "creme",
// "gel"). "beleza" tambem nao tinha "facial"/"creme" na propria lista para
// sequer competir - agora tem.
//
// Cada categoria tem dois niveis de sinal:
// - strongSignals: palavras suficientemente especificas para, sozinhas,
//   indicar a categoria com confianca (ex: "whey", "facial", "serum").
// - weakSignals: palavras compartilhadas entre categorias (ex: "colageno",
//   "creme", "vitamina") - nunca decidem sozinhas contra um sinal forte
//   contrario, so reforcam quando ja ha uma direcao clara.
//
// Quando os scores ficam proximos (ambiguo) ou nenhum sinal bate, a
// categoria retornada e "geral" (UNKNOWN e melhor que inventar) - nunca
// escolhida arbitrariamente.

import type { OfferForAnalysis, ProductIntelligenceCategory } from "@/lib/product-intelligence/types";

export type CategoryKeywordProfile = { strongSignals: string[]; weakSignals: string[] };

export type CategoryEvidence = {
  category: ProductIntelligenceCategory;
  matchedStrongSignals: string[];
  matchedWeakSignals: string[];
  score: number;
};

export type CategoryDetectionStatus = "CONFIDENT" | "AMBIGUOUS" | "UNKNOWN";

export type CategoryDetectionResult = {
  category: ProductIntelligenceCategory; // "geral" quando status != CONFIDENT
  status: CategoryDetectionStatus;
  confidence: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  evidence: CategoryEvidence[]; // todas as categorias com score>0, ordenadas desc
  reason: string;
};

const STRONG_WEIGHT = 3;
const WEAK_WEIGHT = 1;
// Margem minima de score entre o 1o e o 2o colocado pra nao ser tratado
// como ambiguo. Fixada aqui, antes de qualquer teste real.
const AMBIGUOUS_MARGIN = 1;

export const CATEGORY_KEYWORD_PROFILES: Record<Exclude<ProductIntelligenceCategory, "geral">, CategoryKeywordProfile> = {
  suplementos: {
    strongSignals: [
      "whey", "creatina", "termogenico", "pre-treino", "pre treino", "bcaa", "multivitaminico",
      "colageno hidrolisado", "capsulas de colageno", "suplemento alimentar", "em po", "em capsulas", "dose diaria",
    ],
    weakSignals: ["suplement", "colageno", "vitamina", "proteina"],
  },
  perfumes: {
    strongSignals: ["perfum", "colonia", "fragrancia", "eau de", "deo colonia"],
    weakSignals: [],
  },
  eletronicos: {
    strongSignals: [
      "eletronic", "celular", "smartphone", "notebook", "fone", "smartwatch", "tv", "monitor",
      "carregador", "caixa de som", "tablet", "console",
    ],
    weakSignals: [],
  },
  casa: {
    strongSignals: ["organizador", "decoracao", "utilidades domestic"],
    weakSignals: ["casa", "quarto", "sala", "armario"],
  },
  cozinha: {
    strongSignals: ["air fryer", "panela", "liquidificador", "cafeteira", "eletrodomestic"],
    weakSignals: ["cozinha", "utensilio"],
  },
  ferramentas: {
    strongSignals: ["furadeira", "parafusadeira", "kit ferramentas", "bricolagem"],
    weakSignals: ["ferramenta", "chave"],
  },
  pet: {
    strongSignals: ["cachorro", "gato", "racao", "coleira", "petisco", "aquario"],
    weakSignals: ["pet"],
  },
  moda: {
    strongSignals: ["roupa", "calcado", "tenis", "vestido", "camisa", "bolsa", "acessorio de moda"],
    weakSignals: ["moda"],
  },
  beleza: {
    strongSignals: [
      "facial", "serum", "mascara facial", "creme facial", "gel facial", "protetor solar",
      "skincare", "maquiagem", "capilar", "shampoo", "condicionador",
    ],
    weakSignals: ["beleza", "creme", "gel", "cabelo", "cosmetic", "hidratante"],
  },
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function computeCategoryEvidence(haystack: string): CategoryEvidence[] {
  const normalized = normalize(haystack);
  const evidence: CategoryEvidence[] = [];

  for (const [category, profile] of Object.entries(CATEGORY_KEYWORD_PROFILES) as Array<[Exclude<ProductIntelligenceCategory, "geral">, CategoryKeywordProfile]>) {
    const matchedStrongSignals = profile.strongSignals.filter((kw) => normalized.includes(normalize(kw)));
    const matchedWeakRaw = profile.weakSignals.filter((kw) => normalized.includes(normalize(kw)));
    // Evita contar duas vezes a MESMA evidencia textual (ex: "colageno
    // hidrolisado" ja casou forte - o "colageno" fraco dentro dele nao
    // deveria somar pontos de novo).
    const matchedWeakSignals = matchedWeakRaw.filter((weak) => !matchedStrongSignals.some((strong) => strong.includes(weak)));
    const score = matchedStrongSignals.length * STRONG_WEIGHT + matchedWeakSignals.length * WEAK_WEIGHT;
    if (score > 0) evidence.push({ category, matchedStrongSignals, matchedWeakSignals, score });
  }

  return evidence.sort((a, b) => b.score - a.score);
}

export function detectCategoryWithEvidence(offer: OfferForAnalysis): CategoryDetectionResult {
  const haystack = `${offer.title ?? ""} ${offer.category ?? ""}`;
  const evidence = computeCategoryEvidence(haystack);

  if (evidence.length === 0) {
    return {
      category: "geral",
      status: "UNKNOWN",
      confidence: "UNKNOWN",
      evidence: [],
      reason: "Nenhum sinal de categoria (forte ou fraco) detectado no titulo/categoria da oferta.",
    };
  }

  const top = evidence[0];
  const runnerUp = evidence[1];

  if (runnerUp && top.score - runnerUp.score <= AMBIGUOUS_MARGIN) {
    return {
      category: "geral",
      status: "AMBIGUOUS",
      confidence: "LOW",
      evidence,
      reason: `Sinais ambiguos: "${top.category}" (score=${top.score}) e "${runnerUp.category}" (score=${runnerUp.score}) estao proximos demais para decidir com seguranca - categoria nunca escolhida arbitrariamente quando empatada/ambigua.`,
    };
  }

  const confidence = top.matchedStrongSignals.length >= 2 ? "HIGH" : top.matchedStrongSignals.length === 1 ? "MEDIUM" : "LOW";

  return {
    category: top.category,
    status: "CONFIDENT",
    confidence,
    evidence,
    reason: `"${top.category}" vence com score=${top.score} (sinais fortes: ${top.matchedStrongSignals.join(", ") || "nenhum"}; sinais fracos: ${top.matchedWeakSignals.join(", ") || "nenhum"}) - margem segura sobre o 2o colocado${runnerUp ? ` ("${runnerUp.category}", score=${runnerUp.score})` : " (nenhum outro sinal encontrado)"}.`,
  };
}
