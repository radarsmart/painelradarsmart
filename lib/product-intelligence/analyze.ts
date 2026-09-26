// Radar Creative AI - Product Intelligence (mock deterministico)
//
// Nesta fase NAO ha chamada real a OpenAI/Gemini - o objetivo e permitir
// desenvolver e testar todo o fluxo (Product Intelligence -> Creative
// Brain -> Campaign) sem consumir credito nenhum. Quando um provider de IA
// real for ligado, essa funcao pode virar so mais uma implementacao atras
// do mesmo `analyzeProduct()` (mesma ideia de troca de provider do
// lib/ai/factory.ts), sem mudar quem consome.
//
// A deteccao de categoria usa
// lib/product-intelligence/category-detection.ts#detectCategoryWithEvidence -
// evidencia ponderada (sinais fortes vs fracos), nunca "primeira categoria
// cujo keyword bate" (essa logica antiga tinha um bug real: "colageno" -
// compartilhado entre skincare e suplementos - decidia a categoria de um
// creme facial como suplemento so por ordem de insercao do objeto).

import { filterForbiddenClaims, type ClaimViolation } from "@/lib/content-safety/claims-policy";
import { detectCategoryWithEvidence, type CategoryDetectionResult } from "@/lib/product-intelligence/category-detection";
import type {
  OfferForAnalysis,
  ProductIntelligenceCategory,
  ProductIntelligenceDraft,
} from "@/lib/product-intelligence/types";

export type ClaimsAuditEntry = { field: string; removedText: string; violations: ClaimViolation[] };

type CategoryProfile = {
  targetAudience: ProductIntelligenceDraft["targetAudience"];
  painPoints: string[];
  desires: string[];
  objections: string[];
  purchaseMotivations: string[];
  keyBenefits: string[];
  emotionalBenefits: string[];
  functionalBenefits: string[];
  // slugs reais de public.ugc_angles / public.ugc_templates
  recommendedAngleSlugs: string[];
  recommendedFrameworkSlugs: string[];
};

const CATEGORY_PROFILES: Record<Exclude<ProductIntelligenceCategory, "geral">, CategoryProfile> = {
  suplementos: {
    targetAudience: {
      description: "Pessoas que treinam ou querem melhorar saude/energia no dia a dia",
      ageRange: "22-40",
      gender: "misto",
      interests: ["academia", "fitness", "saude", "estetica"],
    },
    painPoints: [
      "falta de energia ou resultado lento no treino",
      "dificuldade de manter consistencia na rotina",
      "preco alto dos suplementos de marca conhecida",
    ],
    desires: [
      "ver resultado fisico mais rapido",
      "ter mais disposicao no dia a dia",
      "economizar sem abrir mao de qualidade",
    ],
    objections: [
      "duvida se funciona de verdade",
      "medo de efeito colateral ou produto sem procedencia",
      "achar caro para testar sem garantia",
    ],
    purchaseMotivations: ["prova social (avaliacoes)", "preco abaixo do usual", "urgencia de estoque"],
    keyBenefits: ["resultado percebido em poucas semanas", "praticidade no consumo diario"],
    emotionalBenefits: ["confianca no proprio corpo", "sensacao de disciplina e progresso"],
    functionalBenefits: ["mais energia", "recuperacao muscular", "suporte nutricional"],
    recommendedAngleSlugs: ["economia-real", "urgencia-curta"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "review-curto"],
  },
  perfumes: {
    targetAudience: {
      description: "Pessoas que quer se sentir bem/marcar presenca sem pagar preco de grife",
      ageRange: "20-45",
      gender: "misto",
      interests: ["moda", "autoestima", "presente"],
    },
    painPoints: [
      "perfume de grife caro demais para o dia a dia",
      "medo de comprar essencia fraca ou falsificada",
    ],
    desires: [
      "cheirar bem o dia inteiro",
      "causar boa impressao sem gastar muito",
      "achar um perfume marcante e diferente",
    ],
    objections: [
      "duvida sobre fixacao e durabilidade do cheiro",
      "nao poder sentir o perfume antes de comprar",
    ],
    purchaseMotivations: ["comparacao com perfume caro conhecido", "descoberta de achado novo"],
    keyBenefits: ["cheiro marcante com boa fixacao", "preco muito abaixo de grife equivalente"],
    emotionalBenefits: ["autoestima", "sensacao de sofisticacao"],
    functionalBenefits: ["durabilidade do aroma", "praticidade do frasco"],
    recommendedAngleSlugs: ["descoberta-escondida", "economia-real"],
    recommendedFrameworkSlugs: ["grupo-secreto", "comparacao-preco"],
  },
  eletronicos: {
    targetAudience: {
      description: "Pessoas que comparam especificacao e preco antes de decidir",
      ageRange: "18-40",
      gender: "misto",
      interests: ["tecnologia", "gadgets", "custo-beneficio"],
    },
    painPoints: [
      "medo de pagar caro por algo que fica ultrapassado rapido",
      "duvida sobre qualidade real da marca menos conhecida",
    ],
    desires: [
      "ter tecnologia atual sem pagar preco de top de linha",
      "achar o melhor custo-beneficio da categoria",
    ],
    objections: [
      "duvida sobre garantia e assistencia",
      "comparacao direta com concorrente mais caro",
    ],
    purchaseMotivations: ["especificacao tecnica clara", "avaliacoes e nota alta", "preco abaixo da media"],
    keyBenefits: ["especificacao competitiva pelo preco", "entrega rapida"],
    emotionalBenefits: ["sensacao de fazer um bom negocio"],
    functionalBenefits: ["performance", "durabilidade", "compatibilidade"],
    recommendedAngleSlugs: ["economia-real", "beneficio-direto"],
    recommendedFrameworkSlugs: ["review-curto", "comparacao-preco"],
  },
  casa: {
    targetAudience: {
      description: "Quem quer resolver um problema pratico do dia a dia em casa",
      ageRange: "25-45",
      gender: "misto",
      interests: ["organizacao", "decoracao", "praticidade"],
    },
    painPoints: ["bagunca ou falta de espaco", "solucao atual improvisada e feia"],
    desires: ["casa mais organizada e bonita", "resolver o problema de forma pratica"],
    objections: ["duvida se cabe no espaco", "duvida sobre material/qualidade"],
    purchaseMotivations: ["resultado visual imediato", "preco baixo para o beneficio"],
    keyBenefits: ["resolve problema pratico do dia a dia", "instalacao/uso simples"],
    emotionalBenefits: ["sensacao de casa mais organizada", "alivio de uma irritacao recorrente"],
    functionalBenefits: ["economia de espaco", "praticidade no uso diario"],
    recommendedAngleSlugs: ["beneficio-direto", "descoberta-escondida"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "oferta-direta"],
  },
  cozinha: {
    targetAudience: {
      description: "Quem cozinha em casa e quer praticidade no dia a dia",
      ageRange: "25-55",
      gender: "misto",
      interests: ["culinaria", "praticidade", "familia"],
    },
    painPoints: ["perder tempo demais cozinhando", "equipamento atual quebrado ou ruim"],
    desires: ["cozinhar mais rapido e facil", "comida saudavel sem esforco"],
    objections: ["duvida sobre durabilidade", "duvida se realmente facilita como promete"],
    purchaseMotivations: ["demonstracao de uso real", "preco abaixo de marca conhecida"],
    keyBenefits: ["economiza tempo no preparo", "resultado consistente"],
    emotionalBenefits: ["menos estresse na rotina", "orgulho de servir algo bem feito"],
    functionalBenefits: ["praticidade", "economia de tempo", "facilidade de limpeza"],
    recommendedAngleSlugs: ["beneficio-direto", "economia-real"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "review-curto"],
  },
  ferramentas: {
    targetAudience: {
      description: "Quem faz consertos ou pequenos projetos em casa/trabalho",
      ageRange: "25-55",
      gender: "misto",
      interests: ["bricolagem", "manutencao", "praticidade"],
    },
    painPoints: ["depender de terceiro para consertos simples", "ferramenta ruim que atrapalha o servico"],
    desires: ["resolver sozinho com o equipamento certo", "ter uma ferramenta durável"],
    objections: ["duvida sobre potencia/qualidade real", "medo de nao servir para o uso pretendido"],
    purchaseMotivations: ["demonstracao pratica de uso", "comparacao de preco com loja fisica"],
    keyBenefits: ["resolve o servico sem depender de terceiro", "durabilidade para uso frequente"],
    emotionalBenefits: ["sensacao de autonomia e capacidade"],
    functionalBenefits: ["potencia adequada", "praticidade de uso"],
    recommendedAngleSlugs: ["beneficio-direto", "economia-real"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "comparacao-preco"],
  },
  pet: {
    targetAudience: {
      description: "Tutores de pet que querem cuidar bem do animal sem gastar demais",
      ageRange: "20-50",
      gender: "misto",
      interests: ["pets", "cuidado animal", "familia"],
    },
    painPoints: ["preocupacao com bem-estar do pet", "gasto alto recorrente com produtos pet"],
    desires: ["ver o pet feliz e confortavel", "praticidade no cuidado diario"],
    objections: ["duvida sobre seguranca/qualidade do material", "duvida se o pet vai se adaptar"],
    purchaseMotivations: ["prova social de outros tutores", "preco abaixo do pet shop"],
    keyBenefits: ["bem-estar direto do animal", "praticidade para o tutor"],
    emotionalBenefits: ["carinho e cuidado com quem se ama", "tranquilidade"],
    functionalBenefits: ["seguranca", "praticidade no uso diario"],
    recommendedAngleSlugs: ["beneficio-direto", "descoberta-escondida"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "review-curto"],
  },
  moda: {
    targetAudience: {
      description: "Pessoas que querem estar na moda sem pagar preco de grife",
      ageRange: "18-35",
      gender: "misto",
      interests: ["moda", "estilo", "tendencias"],
    },
    painPoints: ["roupa de marca cara demais", "medo de comprar algo que nao serve/nao combina"],
    desires: ["estar na tendencia", "montar um look bom gastando pouco"],
    objections: ["duvida sobre caimento/tamanho", "duvida sobre qualidade do tecido/material"],
    purchaseMotivations: ["visual do produto", "comparacao com peça de grife", "preco muito abaixo"],
    keyBenefits: ["visual atual e desejavel", "preco muito abaixo do equivalente de marca"],
    emotionalBenefits: ["autoestima", "sensacao de estar por dentro da tendencia"],
    functionalBenefits: ["variedade de tamanho/cor", "facilidade de troca"],
    recommendedAngleSlugs: ["descoberta-escondida", "economia-real"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "grupo-secreto"],
  },
  beleza: {
    targetAudience: {
      description: "Pessoas que cuidam da aparencia e acompanham novidades de beleza",
      ageRange: "18-45",
      gender: "feminino",
      interests: ["beleza", "skincare", "autoestima"],
    },
    painPoints: ["produto de marca cara nao cabe no orcamento", "resultado que demora a aparecer"],
    desires: ["pele/cabelo com aparencia melhor", "rotina de beleza mais simples"],
    objections: ["duvida se funciona no meu tipo de pele/cabelo", "medo de reacao alergica"],
    purchaseMotivations: ["antes e depois", "avaliacoes de quem usou", "preco abaixo de marca cara"],
    keyBenefits: ["resultado visivel com uso continuo", "praticidade na rotina"],
    emotionalBenefits: ["autoestima", "sensacao de autocuidado"],
    functionalBenefits: ["hidratacao/efeito especifico do produto", "praticidade de aplicacao"],
    recommendedAngleSlugs: ["descoberta-escondida", "beneficio-direto"],
    recommendedFrameworkSlugs: ["demonstracao-curta", "grupo-secreto"],
  },
};

const FALLBACK_PROFILE: CategoryProfile = {
  targetAudience: {
    description: "Publico geral em busca de bom custo-beneficio",
    ageRange: "18-50",
    gender: "misto",
    interests: ["ofertas", "economia"],
  },
  painPoints: ["pagar caro por algo que poderia custar menos"],
  desires: ["fazer um bom negocio", "resolver uma necessidade pontual"],
  objections: ["duvida sobre procedencia/qualidade do produto"],
  purchaseMotivations: ["preco abaixo do usual", "urgencia de oferta por tempo limitado"],
  keyBenefits: ["preco abaixo da media do mercado"],
  emotionalBenefits: ["sensacao de ter feito um bom negocio"],
  functionalBenefits: ["atende a necessidade especifica do produto"],
  recommendedAngleSlugs: ["economia-real", "urgencia-curta"],
  recommendedFrameworkSlugs: ["oferta-direta", "comparacao-preco"],
};

function resolveProfile(category: ProductIntelligenceCategory): CategoryProfile {
  if (category === "geral") return FALLBACK_PROFILE;
  return CATEGORY_PROFILES[category];
}

function hasHighDiscount(offer: OfferForAnalysis): boolean {
  const discountPct = Number(offer.discountPct ?? 0);
  if (discountPct >= 30) return true;

  const price = Number(offer.price ?? 0);
  const originalPrice = Number(offer.originalPrice ?? 0);
  if (price > 0 && originalPrice > price) {
    return (originalPrice - price) / originalPrice >= 0.3;
  }
  return false;
}

function buildSummary(
  offer: OfferForAnalysis,
  category: ProductIntelligenceCategory,
  profile: CategoryProfile,
  filteredPainPoints: string[],
  filteredDesires: string[],
): string {
  const productName = offer.title?.trim() || "este produto";
  const categoryLabel = category === "geral" ? "categoria geral" : category;
  const primaryPain = filteredPainPoints[0] ?? "";
  const primaryDesire = filteredDesires[0] ?? "";
  return (
    `${productName} foi classificado como "${categoryLabel}". Publico principal: ` +
    `${profile.targetAudience.description}. Dor central: "${primaryPain}". ` +
    `Desejo central: "${primaryDesire}".`
  );
}

// Campos de texto livre que passam pela politica de claims (ver
// lib/content-safety/claims-policy.ts) antes de sair desta funcao. Nunca
// inclui campos estruturados (recommendedAngles/recommendedFrameworks,
// targetAudience) - so frases geradas pelo template da categoria.
const CLAIMS_SCANNED_FIELDS = [
  "painPoints",
  "desires",
  "objections",
  "purchaseMotivations",
  "keyBenefits",
  "emotionalBenefits",
  "functionalBenefits",
] as const;

type ClaimsScannedField = (typeof CLAIMS_SCANNED_FIELDS)[number];

function filterProfileClaims(
  profile: CategoryProfile,
  purchaseMotivations: string[],
  category: ProductIntelligenceCategory,
): { filtered: Record<ClaimsScannedField, string[]>; audit: ClaimsAuditEntry[] } {
  const audit: ClaimsAuditEntry[] = [];
  const source: Record<ClaimsScannedField, string[]> = {
    painPoints: profile.painPoints,
    desires: profile.desires,
    objections: profile.objections,
    purchaseMotivations,
    keyBenefits: profile.keyBenefits,
    emotionalBenefits: profile.emotionalBenefits,
    functionalBenefits: profile.functionalBenefits,
  };

  const filtered = {} as Record<ClaimsScannedField, string[]>;

  for (const field of CLAIMS_SCANNED_FIELDS) {
    const result = filterForbiddenClaims(source[field], category, field);
    filtered[field] = result.allowed;
    for (const removed of result.removed) {
      audit.push({ field: removed.field, removedText: removed.text, violations: removed.violations });
    }
  }

  return { filtered, audit };
}

/**
 * Analisa uma oferta e devolve um rascunho de Product Intelligence.
 *
 * Mock inteligente por categoria - NAO chama nenhuma API paga. Serve para
 * desenvolver e testar toda a arquitetura (Product Intelligence -> Creative
 * Brain -> Campaign) sem custo. Trocar por uma implementacao com IA real no
 * futuro nao deve exigir mudar quem chama essa funcao.
 */
export function analyzeProduct(offer: OfferForAnalysis): ProductIntelligenceDraft {
  return analyzeProductWithClaimsAudit(offer).draft;
}

/**
 * Mesma analise de analyzeProduct(), mas tambem devolve a auditoria de
 * claims removidas (para transparencia/relatorio - nao persistida, sem
 * migration). Funcao pura, sem estado compartilhado entre chamadas -
 * importante porque a rota roda no mesmo processo Node para varias
 * requisicoes simultaneas.
 */
export function analyzeProductWithClaimsAudit(
  offer: OfferForAnalysis,
): { draft: ProductIntelligenceDraft; claimsAudit: ClaimsAuditEntry[]; categoryDetection: CategoryDetectionResult } {
  const categoryDetection = detectCategoryWithEvidence(offer);
  const category = categoryDetection.category;
  const profile = resolveProfile(category);

  const purchaseMotivations = hasHighDiscount(offer)
    ? [...profile.purchaseMotivations, "desconto expressivo em relacao ao preco original"]
    : profile.purchaseMotivations;

  const recommendedAngles = profile.recommendedAngleSlugs.map((slug, index) => ({
    slug,
    score: index === 0 ? 80 : 60,
    reason:
      index === 0
        ? `Angulo prioritario para a categoria "${category}".`
        : `Angulo alternativo valido para a categoria "${category}".`,
  }));

  const recommendedFrameworks = profile.recommendedFrameworkSlugs.map((slug, index) => ({
    slug,
    score: index === 0 ? 80 : 60,
    reason:
      index === 0
        ? `Framework prioritario para a categoria "${category}".`
        : `Framework alternativo valido para a categoria "${category}".`,
  }));

  // Camada de seguranca de claims (lib/content-safety/claims-policy.ts):
  // remove qualquer frase do template da categoria que viole a politica
  // (ex: "resultado percebido em poucas semanas" para "suplementos") -
  // nunca substitui por um claim alternativo inventado, so remove. Isso
  // roda ANTES do draft ser retornado, entao nenhuma frase proibida chega
  // a ser salva em product_intelligence.
  const { filtered, audit } = filterProfileClaims(profile, purchaseMotivations, category);

  const draft: ProductIntelligenceDraft = {
    category,
    subcategory: offer.category?.trim() || null,
    targetAudience: profile.targetAudience,
    painPoints: filtered.painPoints,
    desires: filtered.desires,
    objections: filtered.objections,
    purchaseMotivations: filtered.purchaseMotivations,
    keyBenefits: filtered.keyBenefits,
    emotionalBenefits: filtered.emotionalBenefits,
    functionalBenefits: filtered.functionalBenefits,
    recommendedAngles,
    recommendedFrameworks,
    summary: buildSummary(offer, category, profile, filtered.painPoints, filtered.desires),
    source: "mock",
    model: "product-intelligence-rules-v1",
  };

  return { draft, claimsAudit: audit, categoryDetection };
}
