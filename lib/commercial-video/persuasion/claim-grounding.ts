// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Claim Grounding
//
// PURO - constroi PersuasionEvidence a partir de dados JA persistidos
// (offers/product_intelligence) - nunca inventa beneficio. Classifica cada
// claim candidata em FACTUAL/PACKAGING_SUPPORTED/OFFER_SUPPORTED/
// SAFE_INFERENCE/UNVERIFIED/FORBIDDEN.
//
// ACHADO REAL (nao hipotetico) do COMMERCIAL V2 FULL CANARY (campanha
// Kokeshi, 660d53b5...): product_intelligence.category = "suplementos"
// para "Creme Gel Regenerador Facial Gota de Colageno Kokeshi" - um creme
// FACIAL topico, nao um suplemento ingerido. pain_points/desires/
// objections/functional_benefits daquele registro ("falta de energia no
// treino", "recuperacao muscular", "mais energia") descrevem OUTRO
// produto. detectCategoryMismatch() formaliza essa deteccao por
// palavras-chave (nunca visao computacional, nunca LLM) - quando
// detectado, TODO o pain_points/desires/objections/functional_benefits do
// product_intelligence e tratado como FORBIDDEN (categoria errada, nao
// aplicavel a este produto), nunca usado como base de persuasao.

import { scanTextForForbiddenClaims } from "@/lib/content-safety/claims-policy";
import type { CategoryMismatchFinding, ClaimSource, ClaimStatus, PersuasionClaim, PersuasionEvidence } from "@/lib/commercial-video/persuasion/types";

// Palavras-chave de categoria SKINCARE/BELEZA TOPICA vs SUPLEMENTO/INGESTAO -
// listas pequenas e deliberadamente genericas (nunca especificas de
// Kokeshi), usadas so para detectar INCONSISTENCIA entre o titulo real do
// produto e a categoria/linguagem persistida - nunca para classificar
// produtos novos automaticamente em producao real sem revisao humana.
const TOPICAL_SKINCARE_KEYWORDS = ["facial", "creme", "gel", "pele", "rosto", "colageno", "colágeno", "hidratante", "serum", "sérum", "locao", "loção"];
const INGESTION_FITNESS_KEYWORDS = ["treino", "muscular", "suplemento", "energia", "consumo diario", "consumo diário", "nutricional", "whey", "caps", "capsula", "cápsula"];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function detectCategoryMismatch(productTitle: string, declaredCategory: string, productIntelligenceText: string[]): CategoryMismatchFinding {
  const normalizedTitle = normalize(productTitle);
  const normalizedPiText = normalize(productIntelligenceText.join(" | "));

  const signalKeywordsInTitle = TOPICAL_SKINCARE_KEYWORDS.filter((kw) => normalizedTitle.includes(normalize(kw)));
  const mismatchKeywordsInProductIntelligence = INGESTION_FITNESS_KEYWORDS.filter((kw) => normalizedPiText.includes(normalize(kw)));

  const declaredIsIngestionFitness = declaredCategory === "suplementos";
  const detected = declaredIsIngestionFitness && signalKeywordsInTitle.length > 0 && mismatchKeywordsInProductIntelligence.length > 0;

  return {
    detected,
    declaredCategory,
    signalKeywordsInTitle,
    mismatchKeywordsInProductIntelligence,
    reason: detected
      ? `Titulo real do produto ("${productTitle}") contem sinais de cuidado facial topico (${signalKeywordsInTitle.join(", ")}), mas category="${declaredCategory}" e o texto de product_intelligence contem linguagem de ingestao/treino (${mismatchKeywordsInProductIntelligence.join(", ")}) - registro de Product Intelligence provavelmente gerado para OUTRO produto.`
      : "Nenhuma inconsistencia detectada entre titulo e categoria/linguagem de product_intelligence.",
  };
}

function claim(id: string, text: string, status: ClaimStatus, source: ClaimSource, confidence: "LOW" | "MEDIUM" | "HIGH", reason: string): PersuasionClaim {
  return { id, text, status, source, confidence, reason };
}

export type ProductIntelligenceInput = {
  category: string;
  painPoints: string[];
  desires: string[];
  objections: string[];
  purchaseMotivations: string[];
  keyBenefits: string[];
  emotionalBenefits: string[];
  functionalBenefits: string[];
};

export type OfferInput = {
  title: string;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  marketplace: string | null;
  imageUrl: string | null;
  rating: number | null;
  reviewsCount: number | null;
};

// Texto REAL observado na embalagem do produto via inspecao visual direta
// dos frames do CANARY real (nao uma alegacao nova, nao OCR automatizado -
// documentado como PACKAGING_OBSERVED, a fonte mais confiavel disponivel
// hoje, ja que o projeto nao tem OCR de embalagem implementado). Passado
// pelo CALLER (script de DRY_RUN) - este modulo nunca inventa esse texto
// sozinho.
export type ObservedPackagingText = { text: string; observedVia: string };

export function buildPersuasionEvidence(
  offer: OfferInput,
  productIntelligence: ProductIntelligenceInput,
  observedPackagingTexts: ObservedPackagingText[] = [],
): PersuasionEvidence {
  const allPiText = [
    ...productIntelligence.painPoints,
    ...productIntelligence.desires,
    ...productIntelligence.objections,
    ...productIntelligence.purchaseMotivations,
    ...productIntelligence.keyBenefits,
    ...productIntelligence.emotionalBenefits,
    ...productIntelligence.functionalBenefits,
  ];
  const categoryMismatch = detectCategoryMismatch(offer.title, productIntelligence.category, allPiText);

  const factualClaims: PersuasionClaim[] = [
    claim("fact-title", offer.title, "FACTUAL", "FACT", "HIGH", "Titulo real da oferta persistido."),
  ];
  if (offer.price !== null) {
    factualClaims.push(claim("fact-price", `Preco: R$ ${offer.price.toFixed(2).replace(".", ",")}`, "FACTUAL", "FACT", "HIGH", "Preco real persistido em offers.price."));
  }
  factualClaims.push(
    claim(
      "fact-discount",
      offer.discountPct && offer.discountPct > 0 ? `Desconto real: ${offer.discountPct}%` : "Sem desconto real (discount_pct = 0)",
      "FACTUAL",
      "FACT",
      "HIGH",
      "discount_pct real persistido - nunca inventar desconto/0% OFF.",
    ),
  );

  const packagingClaims: PersuasionClaim[] = observedPackagingTexts.map((obs, index) =>
    claim(`packaging-${index}`, obs.text, "PACKAGING_SUPPORTED", "PACKAGING", "HIGH", `Observado diretamente na embalagem real (${obs.observedVia}).`),
  );

  const offerClaims: PersuasionClaim[] = [];
  if (offer.marketplace) {
    offerClaims.push(claim("offer-marketplace", `Disponivel em ${offer.marketplace}`, "OFFER_SUPPORTED", "OFFER", "HIGH", "Marketplace real persistido."));
  }
  if (offer.rating !== null || offer.reviewsCount !== null) {
    offerClaims.push(
      claim(
        "offer-social-proof",
        `rating=${offer.rating ?? "null"} reviewsCount=${offer.reviewsCount ?? "null"}`,
        offer.rating !== null && offer.reviewsCount !== null && offer.reviewsCount > 0 ? "OFFER_SUPPORTED" : "UNVERIFIED",
        "OFFER",
        offer.rating !== null && offer.reviewsCount !== null && offer.reviewsCount > 0 ? "MEDIUM" : "LOW",
        offer.rating !== null && offer.reviewsCount !== null && offer.reviewsCount > 0
          ? "Rating/reviewsCount reais persistidos - prova social utilizavel."
          : "rating/reviewsCount ausentes (null) - NENHUMA prova social pode ser reivindicada (nunca inventar avaliacoes).",
      ),
    );
  } else {
    offerClaims.push(claim("offer-social-proof", "Sem rating/reviewsCount disponiveis", "UNVERIFIED", "OFFER", "LOW", "offers.rating e offers.reviews_count sao null - prova social NAO pode ser usada."));
  }

  // Se a categoria esta errada (achado real do CANARY), TODO o texto de
  // product_intelligence vira FORBIDDEN - descreve outro produto, nunca
  // usavel como base de persuasao para este.
  const inferredClaims: PersuasionClaim[] = [];
  const forbiddenClaims: PersuasionClaim[] = [];
  const unknownClaims: PersuasionClaim[] = [];

  const piEntries: Array<{ id: string; text: string; kind: string }> = [
    ...productIntelligence.painPoints.map((t, i) => ({ id: `pi-pain-${i}`, text: t, kind: "pain_point" })),
    ...productIntelligence.desires.map((t, i) => ({ id: `pi-desire-${i}`, text: t, kind: "desire" })),
    ...productIntelligence.objections.map((t, i) => ({ id: `pi-objection-${i}`, text: t, kind: "objection" })),
    ...productIntelligence.purchaseMotivations.map((t, i) => ({ id: `pi-motivation-${i}`, text: t, kind: "purchase_motivation" })),
    ...productIntelligence.keyBenefits.map((t, i) => ({ id: `pi-key-benefit-${i}`, text: t, kind: "key_benefit" })),
    ...productIntelligence.emotionalBenefits.map((t, i) => ({ id: `pi-emotional-${i}`, text: t, kind: "emotional_benefit" })),
    ...productIntelligence.functionalBenefits.map((t, i) => ({ id: `pi-functional-${i}`, text: t, kind: "functional_benefit" })),
  ];

  for (const entry of piEntries) {
    const violations = scanTextForForbiddenClaims(entry.text, productIntelligence.category);
    if (violations.length > 0) {
      forbiddenClaims.push(
        claim(entry.id, entry.text, "FORBIDDEN", "CATEGORY_INFERENCE", "LOW", `Bloqueada pela politica de claims existente (${violations.map((v) => v.ruleLabel).join(", ")}).`),
      );
      continue;
    }
    if (categoryMismatch.detected) {
      forbiddenClaims.push(claim(entry.id, entry.text, "FORBIDDEN", "CATEGORY_INFERENCE", "LOW", `product_intelligence.category ("${categoryMismatch.declaredCategory}") nao corresponde ao produto real (${entry.kind}) - ver categoryMismatch.`));
      continue;
    }
    unknownClaims.push(claim(entry.id, entry.text, "UNVERIFIED", "CATEGORY_INFERENCE", "LOW", `${entry.kind} de product_intelligence sem confirmacao factual/de embalagem/de oferta - tratado como nao verificado.`));
  }

  return {
    productName: offer.title,
    category: productIntelligence.category,
    price: offer.price,
    originalPrice: offer.originalPrice,
    discountPercent: offer.discountPct,
    marketplace: offer.marketplace,
    productImageUrl: offer.imageUrl,
    rating: offer.rating,
    reviewsCount: offer.reviewsCount,
    factualClaims,
    packagingClaims,
    offerClaims,
    inferredClaims,
    forbiddenClaims,
    unknownClaims,
    categoryMismatch,
  };
}
