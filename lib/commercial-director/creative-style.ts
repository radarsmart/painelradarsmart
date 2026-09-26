// Radar Creative AI - Commercial Director / Creative Style
//
// Agrupa 4 decisoes pequenas e correlatas (estrutura narrativa, ritmo,
// estilo visual, estrategia de texto na tela) - todas deterministicas,
// sem IA, derivadas de categoria/framework/argumento ja conhecidos.

import type {
  CommercialPace,
  SellingArgument,
  StoryStructure,
  TextOverlayStrategy,
  VisualStyle,
} from "@/lib/commercial-director/types";

// Mesmo mapeamento conceitual ja documentado em
// lib/creative-brain/framework-selector.ts (slug real -> familia
// conceitual de framework).
const FRAMEWORK_TO_STRUCTURE: Record<string, StoryStructure> = {
  "oferta-direta": "DIRECT_OFFER",
  "review-curto": "REVIEW",
  "demonstracao-curta": "DEMONSTRATION",
  "grupo-secreto": "DISCOVERY",
  "comparacao-preco": "COMPARISON",
};

export function resolveStoryStructure(frameworkSlug: string): { structure: StoryStructure; reason: string } {
  const structure = FRAMEWORK_TO_STRUCTURE[frameworkSlug];
  if (structure) {
    return { structure, reason: `framework "${frameworkSlug}" mapeia diretamente para a estrutura ${structure}` };
  }
  return { structure: "PROBLEM_SOLUTION", reason: `framework "${frameworkSlug}" sem mapeamento especifico - usando estrutura padrao problema/solucao` };
}

export function selectPace(structure: StoryStructure, category: string): { pace: CommercialPace; reason: string } {
  if (category === "perfumes") {
    return { pace: "CINEMATIC", reason: "categoria perfumes pede ritmo cinematografico/premium" };
  }
  if (structure === "DIRECT_OFFER" || structure === "COMPARISON") {
    return { pace: "FAST", reason: `estrutura ${structure} funciona melhor com corte rapido (TikTok/Reels performance)` };
  }
  if (structure === "STORYTELLING") {
    return { pace: "CINEMATIC", reason: "storytelling pede ritmo mais lento e cinematografico" };
  }
  return { pace: "MEDIUM", reason: "ritmo padrao para a estrutura escolhida" };
}

const CATEGORY_VISUAL_STYLE: Record<string, VisualStyle> = {
  perfumes: "LUXURY",
  beleza: "BEAUTY",
  moda: "LIFESTYLE",
  eletronicos: "TECH",
  suplementos: "FITNESS",
  casa: "HOME_DEMO",
  cozinha: "HOME_DEMO",
  ferramentas: "HOME_DEMO",
  pet: "LIFESTYLE",
};

export function selectVisualStyle(category: string): { style: VisualStyle; reason: string } {
  const style = CATEGORY_VISUAL_STYLE[category];
  if (style) {
    return { style, reason: `categoria "${category}" mapeia para o estilo visual ${style}` };
  }
  return { style: "PRODUCT_HERO", reason: `categoria "${category}" sem estilo especifico - produto em destaque como padrao` };
}

export function selectTextOverlayStrategy(
  sellingArgument: SellingArgument,
  structure: StoryStructure,
): { strategy: TextOverlayStrategy; reason: string } {
  if (sellingArgument === "DISCOUNT" || sellingArgument === "SAVINGS" || sellingArgument === "PRICE") {
    return { strategy: "PRICE_FOCUSED", reason: "argumento de preco/desconto pede texto focado no preco" };
  }
  if (sellingArgument === "SOCIAL_PROOF") {
    return { strategy: "SOCIAL_PROOF", reason: "argumento de prova social pede destacar avaliacao/numero real" };
  }
  if (structure === "STORYTELLING") {
    return { strategy: "MINIMAL", reason: "storytelling funciona melhor com o minimo de texto na tela" };
  }
  if (sellingArgument === "PRACTICAL_BENEFIT" || sellingArgument === "EMOTIONAL_BENEFIT") {
    return { strategy: "BENEFIT_FOCUSED", reason: "argumento de beneficio pede texto reforcando o beneficio" };
  }
  return { strategy: "MINIMAL", reason: "fallback: pouco texto, frases curtas" };
}
