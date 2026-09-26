// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Scroll Stop Engine V2
//
// PURO - SCROLL_STOP_POWER, distinto de HookPersuasionScore. Hook
// Persuasion pergunta "existe razao de VENDA para continuar assistindo?";
// Scroll Stop pergunta "existe razao PERCEPTIVA/ATENCIONAL para o polegar
// parar?" - um plano cinematografico pode ter ScrollStopScore baixo mesmo
// com boa cinematografia.
//
// V2 (DECISION-SENSITIVE SCORING + CALIBRATION): auditoria real provou que
// o V1 tinha um teto matematico de ~72 para qualquer HOOK (soma dos
// maximos de cada bucket), porque a maioria dos componentes saturava a
// partir de qualquer claim real presente e `motionInterest` era uma
// CONSTANTE (50) que nenhuma decisao de storyboard conseguia mover -
// exatamente o achado do DRY_RUN real da campanha Kokeshi (A=69,
// B=D=72=teto, C=60). V2 substitui buckets binarios por gradacao real
// derivada de sinais JA existentes em PersuasionSceneConcept
// (productInteraction, characterPerformanceIntent, offerRole,
// benefitClaimId) - nunca depende de provider/geracao real, nunca precisa
// de campo novo obrigatorio no schema.
//
// Pesos e buckets documentados e FIXADOS aqui, calibrados contra os 8
// fixtures sinteticos (anti-gaming-fixtures.ts) ANTES de rodar o DRY_RUN
// real contra Kokeshi - nunca ajustados depois para forcar um resultado
// especifico daquela campanha.

import type { CharacterPerformanceIntent, PersuasionEvidence, PersuasionSceneConcept, ScrollStopBreakdown, ScrollStopComponentDetail, ScrollStopResult } from "@/lib/commercial-video/persuasion/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const DEMONSTRATION_ROLES = new Set(["DEMONSTRATION", "EXPERIENCE", "RESULT_VISUALIZATION", "INGREDIENT_STORY", "HUMAN_REACTION"]);
function isDemonstrationRole(role: string): boolean {
  return DEMONSTRATION_ROLES.has(role);
}

// Pesos - somam 1.0. motionInterest e firstSecondEventStrength carregam o
// maior peso combinado (0.32) porque sao os dois componentes que o V1
// tratava como praticamente constantes/proxy fraco - agora sao os
// principais drivers reais de "por que o polegar para".
const WEIGHTS = {
  specificity: 0.1,
  visualInterrupt: 0.14,
  productRelevance: 0.1,
  priceCuriosity: 0.1,
  humanInterest: 0.12,
  motionInterest: 0.16,
  firstSecondEventStrength: 0.16,
  curiosityGap: 0.12,
} as const;

type ComponentResult = { score: number; maxScore: number; reason: string; sourceDecision: string; improvableBy: string[] };

// --- 1. SPECIFICITY (claim-groundedness) ------------------------------------
function scoreSpecificity(scene: PersuasionSceneConcept): ComponentResult {
  if (scene.benefitClaimId !== null && scene.offerRole !== "NONE") {
    return {
      score: 92,
      maxScore: 92,
      reason: "Claim real atribuida AO hook combinada com estrategia de oferta explicita (offerRole) - especificidade maxima.",
      sourceDecision: "benefitClaimId + offerRole",
      improvableBy: [],
    };
  }
  if (scene.benefitClaimId !== null) {
    return { score: 80, maxScore: 92, reason: "Claim real (benefitClaimId) atribuida ao hook.", sourceDecision: "benefitClaimId", improvableBy: ["combinar com uma estrategia de oferta (offerRole) no mesmo hook"] };
  }
  if (isDemonstrationRole(scene.productVisualRole)) {
    return { score: 55, maxScore: 92, reason: "Papel visual de demonstracao, mas sem claim real atribuida.", sourceDecision: "productVisualRole", improvableBy: ["atribuir uma claim real (benefitClaimId) grounded em evidencia"] };
  }
  return { score: 25, maxScore: 92, reason: "Nenhuma claim real nem papel de demonstracao no hook.", sourceDecision: "nenhum sinal", improvableBy: ["atribuir uma claim real", "usar um productVisualRole de demonstracao"] };
}

// --- 2. VISUAL_INTERRUPT (pattern interrupt, nunca so "cenario bonito") ------
const VISUAL_INTERRUPT_BASE: Record<string, number> = {
  FLOATING_HERO: 35, // classico giveaway de anuncio generico de IA - baixo interrupt real
  PACKSHOT: 40, // exatamente o que o feed ja espera
  EXPERIENCE: 55,
  RESULT_VISUALIZATION: 60,
  HUMAN_REACTION: 65,
  INGREDIENT_STORY: 65,
  DEMONSTRATION: 70,
};
function scoreVisualInterrupt(scene: PersuasionSceneConcept): ComponentResult {
  const base = VISUAL_INTERRUPT_BASE[scene.productVisualRole] ?? 40;
  const interactionCombo = (scene.productInteraction === "APPLIED" || scene.productInteraction === "DEMONSTRATED") && scene.characterNarrativeRole !== "NONE";
  const score = interactionCombo ? clamp(base + 20) : base;
  return {
    score,
    maxScore: 90,
    reason: interactionCombo
      ? `productVisualRole="${scene.productVisualRole}" combinado com interacao humana ativa real (nao so presenca) - pattern interrupt forte.`
      : `productVisualRole="${scene.productVisualRole}" - interrupt baseado so no papel visual, sem interacao ativa combinada.`,
    sourceDecision: "productVisualRole + productInteraction + characterNarrativeRole",
    improvableBy: interactionCombo ? [] : ["combinar productVisualRole de demonstracao com productInteraction APPLIED/DEMONSTRATED e personagem presente"],
  };
}

// --- 3. PRODUCT_RELEVANCE (gradacao real, nunca satura so por nao ser FLOATING_HERO) ---
const PRODUCT_RELEVANCE_BASE: Record<string, number> = {
  FLOATING_HERO: 35,
  PACKSHOT: 55,
  EXPERIENCE: 68,
  RESULT_VISUALIZATION: 68,
  HUMAN_REACTION: 68,
  DEMONSTRATION: 80,
  INGREDIENT_STORY: 80,
};
function scoreProductRelevance(scene: PersuasionSceneConcept): ComponentResult {
  const base = PRODUCT_RELEVANCE_BASE[scene.productVisualRole] ?? 55;
  const relevantToMessage = scene.benefitClaimId !== null && scene.productInteraction !== "NONE";
  const score = relevantToMessage ? clamp(base + 15) : base;
  return {
    score,
    maxScore: 95,
    reason: relevantToMessage
      ? `productVisualRole="${scene.productVisualRole}" + produto relevante A MENSAGEM (claim real + interacao real), nao so presente na tela.`
      : `productVisualRole="${scene.productVisualRole}" - produto presente, mas sem confirmar relevancia direta a mensagem do hook (falta claim+interacao juntos).`,
    sourceDecision: "productVisualRole + benefitClaimId + productInteraction",
    improvableBy: relevantToMessage ? [] : ["conectar o produto a uma claim real E a uma interacao real (nao so mostrar o produto)"],
  };
}

// --- 4. PRICE_CURIOSITY (escopado a esta cena, nunca so por evidence.price global) ---
function scorePriceCuriosity(scene: PersuasionSceneConcept, evidence: PersuasionEvidence): ComponentResult {
  const priceReferencedInScene = scene.offerRole !== "NONE" || /r\$/i.test(scene.whyContinueWatching) || /r\$/i.test(scene.suggestedNarration);
  const priceIsCheap = evidence.price !== null && evidence.price < 30;

  if (priceReferencedInScene && priceIsCheap) {
    return { score: 85, maxScore: 85, reason: "Preco real baixo E referenciado especificamente neste hook - curiosidade de valor genuina.", sourceDecision: "offerRole/whyContinueWatching + evidence.price", improvableBy: [] };
  }
  if (priceReferencedInScene) {
    return { score: 50, maxScore: 85, reason: "Preco referenciado neste hook, mas nao e um valor de entrada especialmente baixo - curiosidade de valor moderada.", sourceDecision: "offerRole/whyContinueWatching", improvableBy: ["nada a fazer sobre o preco real - nao inventar desconto"] };
  }
  if (priceIsCheap) {
    return { score: 30, maxScore: 85, reason: "Preco real e baixo, mas este hook NAO o referencia - potencial de curiosidade de preco desperdicado.", sourceDecision: "evidence.price (nao usado nesta cena)", improvableBy: ["referenciar o preco real no gancho textual/offerRole deste hook, se fizer sentido para o angulo escolhido"] };
  }
  return { score: 20, maxScore: 85, reason: "Nenhum sinal de curiosidade de preco disponivel nesta cena.", sourceDecision: "nenhum", improvableBy: [] };
}

// --- 5. HUMAN_INTEREST (qualidade de interacao, nunca so presenca) ----------
function scoreHumanInterest(scene: PersuasionSceneConcept): ComponentResult {
  if (scene.characterNarrativeRole === "NONE") {
    return { score: 30, maxScore: 85, reason: "Sem personagem - escolha valida de storyboard, nem penalizada nem bonificada alem da base.", sourceDecision: "characterNarrativeRole=NONE", improvableBy: ["introduzir personagem com interacao real, se fizer sentido para o angulo"] };
  }
  const intent: CharacterPerformanceIntent | null = scene.characterPerformanceIntent;
  if (!intent) {
    return { score: 40, maxScore: 85, reason: "Personagem presente mas sem intencao de performance definida - presenca fraca, nao interacao.", sourceDecision: "characterNarrativeRole sem characterPerformanceIntent", improvableBy: ["definir characterPerformanceIntent com productInteractionIntent ativo (APPLIED/DEMONSTRATED)"] };
  }
  if (intent.productInteractionIntent === "APPLIED" || intent.productInteractionIntent === "DEMONSTRATED") {
    return { score: 85, maxScore: 85, reason: "Interacao real e ativa do personagem com o produto (aplicando/demonstrando) - nao so segurando.", sourceDecision: "characterPerformanceIntent.productInteractionIntent", improvableBy: [] };
  }
  if (intent.productInteractionIntent === "HELD" || intent.productInteractionIntent === "POINTED_AT") {
    return { score: 55, maxScore: 85, reason: "Personagem presente com o produto, mas interacao passiva (segurando/apontando) - pessoa parada nao ganha score maximo.", sourceDecision: "characterPerformanceIntent.productInteractionIntent", improvableBy: ["mudar para uma interacao ativa (aplicar/demonstrar) em vez de so segurar"] };
  }
  return { score: 45, maxScore: 85, reason: "Personagem presente, interacao com produto nao especificada como ativa.", sourceDecision: "characterPerformanceIntent.productInteractionIntent", improvableBy: ["especificar uma interacao ativa real"] };
}

// --- 6. MOTION_INTEREST (NOVO - derivado de productInteraction, nunca constante) ---
const MOTION_LADDER: Record<string, { intensity: string; score: number }> = {
  NONE: { intensity: "STATIC", score: 25 },
  HELD: { intensity: "SUBTLE", score: 45 },
  POINTED_AT: { intensity: "SUBTLE", score: 45 },
  COMPARED: { intensity: "MODERATE", score: 65 },
  APPLIED: { intensity: "STRONG", score: 85 },
  DEMONSTRATED: { intensity: "STRONG", score: 85 },
};
function scoreMotionInterest(scene: PersuasionSceneConcept): ComponentResult {
  const entry = MOTION_LADDER[scene.productInteraction] ?? MOTION_LADDER.NONE;
  const revealBonus = scene.offerRole === "REVEAL" ? 10 : 0;
  const score = clamp(entry.score + revealBonus);
  return {
    score,
    maxScore: 95,
    reason: `productInteraction="${scene.productInteraction}" classifica intensidade de acao como ${entry.intensity}${revealBonus > 0 ? " + reveal de oferta acontecendo nesta cena" : ""}.`,
    sourceDecision: "productInteraction" + (revealBonus > 0 ? " + offerRole" : ""),
    improvableBy: entry.intensity === "STRONG" ? [] : ["usar productInteraction=APPLIED ou DEMONSTRATED (acao real, nao so segurar/apontar)"],
  };
}

// --- 7. FIRST_SECOND_EVENT_STRENGTH (NOVO - substitui proxy de tamanho de string) ---
function scoreFirstSecondEventStrength(scene: PersuasionSceneConcept): ComponentResult {
  const signals: Array<[boolean, string]> = [
    [scene.productInteraction !== "NONE", "mudanca visual perceptivel (productInteraction != NONE)"],
    [scene.offerRole === "SETUP" || scene.offerRole === "REVEAL", "entrada/descoberta de oferta (offerRole)"],
    [scene.characterNarrativeRole !== "NONE" && scene.productInteraction !== "NONE", "interacao humana real com o produto"],
    [scene.benefitClaimId !== null, "informacao especifica (claim real)"],
    [isDemonstrationRole(scene.productVisualRole), "transformacao de composicao (sai do packshot parado padrao)"],
  ];
  const matched = signals.filter(([hit]) => hit).map(([, label]) => label);
  const bucket = [20, 45, 62, 78, 90, 97];
  const score = bucket[Math.min(matched.length, 5)];
  return {
    score,
    maxScore: 97,
    reason:
      matched.length === 0
        ? "Nenhum evento concreto nos primeiros 0-1s - plano praticamente estatico ou pedestal reveal generico."
        : `${matched.length} sinal(is) concreto(s) de evento no primeiro segundo: ${matched.join("; ")}.`,
    sourceDecision: "productInteraction + offerRole + characterNarrativeRole + benefitClaimId + productVisualRole",
    improvableBy: matched.length >= 5 ? [] : signals.filter(([hit]) => !hit).map(([, label]) => `adicionar: ${label}`),
  };
}

// --- 8. CURIOSITY_GAP (NOVO - distinto de specificity, nunca premia info ja totalmente entregue) ---
function scoreCuriosityGap(scene: PersuasionSceneConcept): ComponentResult {
  const hasOpenQuestion = scene.whyContinueWatching.includes("?");
  const priceTeased = scene.offerRole === "SETUP";
  const claimTeasedNotShown = scene.benefitClaimId !== null && scene.productInteraction === "NONE";
  const claimAlreadyResolved = scene.benefitClaimId !== null && (scene.productInteraction === "APPLIED" || scene.productInteraction === "DEMONSTRATED");

  let score = 25;
  const matched: string[] = [];
  if (hasOpenQuestion) {
    score += 25;
    matched.push("gancho textual cria uma pergunta explicita");
  }
  if (priceTeased) {
    score += 25;
    matched.push("preco mencionado mas ainda nao revelado - lacuna real");
  }
  if (claimTeasedNotShown) {
    score += 20;
    matched.push("beneficio sugerido mas ainda nao demonstrado - lacuna real");
  }
  if (claimAlreadyResolved && !hasOpenQuestion && !priceTeased) {
    score -= 10;
    matched.push("informacao ja entregue/demonstrada de imediato - pouca razao residual de curiosidade (o valor dessa cena esta em FIRST_SECOND_EVENT_STRENGTH, nao aqui)");
  }
  score = clamp(score);

  return {
    score,
    maxScore: 95,
    reason: matched.length > 0 ? matched.join("; ") + "." : "Nenhuma lacuna de curiosidade especifica identificada.",
    sourceDecision: "whyContinueWatching + offerRole + benefitClaimId + productInteraction",
    improvableBy: hasOpenQuestion && priceTeased && claimTeasedNotShown ? [] : ["criar uma pergunta explicita no gancho", "revelar o preco so depois (offerRole=SETUP)", "sugerir um beneficio sem demonstra-lo ainda nesta cena"],
  };
}

function computeGenericAdPenalty(scene: PersuasionSceneConcept): { amount: number; reason: string } {
  if (scene.environmentRelevance === "UNRELATED_ASPIRATIONAL") return { amount: 25, reason: `Ambiente do hook (${scene.environmentRelevance}) penaliza genericAdPenalty=25.` };
  if (scene.environmentRelevance === "GENERIC_STUDIO") return { amount: 10, reason: `Ambiente do hook (${scene.environmentRelevance}) penaliza genericAdPenalty=10.` };
  return { amount: 0, reason: "Ambiente do hook nao penaliza (contexto nativo ou adjacente ao produto)." };
}

export function scoreScrollStop(hookScene: PersuasionSceneConcept, evidence: PersuasionEvidence): ScrollStopResult {
  const specificity = scoreSpecificity(hookScene);
  const visualInterrupt = scoreVisualInterrupt(hookScene);
  const productRelevance = scoreProductRelevance(hookScene);
  const priceCuriosity = scorePriceCuriosity(hookScene, evidence);
  const humanInterest = scoreHumanInterest(hookScene);
  const motionInterest = scoreMotionInterest(hookScene);
  const firstSecondEventStrength = scoreFirstSecondEventStrength(hookScene);
  const curiosityGap = scoreCuriosityGap(hookScene);
  const genericAdPenalty = computeGenericAdPenalty(hookScene);

  const weightedComponents: Array<[string, ComponentResult, number]> = [
    ["specificity", specificity, WEIGHTS.specificity],
    ["visualInterrupt", visualInterrupt, WEIGHTS.visualInterrupt],
    ["productRelevance", productRelevance, WEIGHTS.productRelevance],
    ["priceCuriosity", priceCuriosity, WEIGHTS.priceCuriosity],
    ["humanInterest", humanInterest, WEIGHTS.humanInterest],
    ["motionInterest", motionInterest, WEIGHTS.motionInterest],
    ["firstSecondEventStrength", firstSecondEventStrength, WEIGHTS.firstSecondEventStrength],
    ["curiosityGap", curiosityGap, WEIGHTS.curiosityGap],
  ];

  const weightedSum = weightedComponents.reduce((sum, [, c, w]) => sum + c.score * w, 0);
  const score = clamp(weightedSum - genericAdPenalty.amount);

  const reasons: string[] = [];
  if (hookScene.productVisualRole === "FLOATING_HERO") reasons.push("Hook = produto flutuando (FLOATING_HERO) - baixo interrupt/relevancia real, penaliza scroll-stop.");
  if (genericAdPenalty.amount > 0) reasons.push(genericAdPenalty.reason);
  if (priceCuriosity.score >= 80) reasons.push("Preco real referenciado neste hook e sustenta curiosidade de valor forte.");
  if (motionInterest.score < 45) reasons.push("Pouca ou nenhuma acao real no hook (motionInterest baixo) - produto/personagem essencialmente parado.");
  if (firstSecondEventStrength.score < 45) reasons.push("Poucos eventos concretos no primeiro segundo - risco de pedestal reveal generico.");

  const componentDetails: ScrollStopComponentDetail[] = weightedComponents.map(([name, c]) => ({
    name,
    score: c.score,
    maxScore: c.maxScore,
    classification: name === "motionInterest" || name === "firstSecondEventStrength" || name === "curiosityGap" || name === "humanInterest" || name === "visualInterrupt" || name === "productRelevance" || name === "specificity" ? "DECISION_SENSITIVE" : "INPUT_SENSITIVE",
    reason: c.reason,
    sourceDecision: c.sourceDecision,
    improvableBy: c.improvableBy,
  }));
  // priceCuriosity e parcialmente INPUT_SENSITIVE (depende de evidence.price,
  // fora do controle do storyboard) e parcialmente DECISION_SENSITIVE
  // (depende de a cena referenciar o preco ou nao) - classificado explicitamente.
  const priceCuriosityDetail = componentDetails.find((c) => c.name === "priceCuriosity");
  if (priceCuriosityDetail) priceCuriosityDetail.classification = "INPUT_SENSITIVE";

  const sortedByGap = [...componentDetails].sort((a, b) => b.score / b.maxScore - a.score / a.maxScore);
  const strongestDrivers = sortedByGap.slice(0, 3).map((c) => c.name);
  const weakestDrivers = sortedByGap.slice(-3).reverse().map((c) => c.name);

  const breakdown: ScrollStopBreakdown = {
    total: score,
    components: componentDetails,
    penalties: genericAdPenalty.amount > 0 ? [{ name: "genericAdPenalty", amount: genericAdPenalty.amount, reason: genericAdPenalty.reason }] : [],
    strongestDrivers,
    weakestDrivers,
    headroom: clamp(100 - score),
  };

  return {
    score,
    components: {
      specificity: specificity.score,
      visualInterrupt: visualInterrupt.score,
      productRelevance: productRelevance.score,
      priceCuriosity: priceCuriosity.score,
      humanInterest: humanInterest.score,
      motionInterest: motionInterest.score,
      firstSecondEventStrength: firstSecondEventStrength.score,
      curiosityGap: curiosityGap.score,
      genericAdPenalty: genericAdPenalty.amount,
    },
    reasons,
    breakdown,
  };
}
