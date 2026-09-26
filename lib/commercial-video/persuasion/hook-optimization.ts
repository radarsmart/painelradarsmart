// Radar Creative AI - Scroll-Stop Hook Optimization V1
//
// PURO, 100% DRY_RUN - nunca gera midia, nunca chama provider, nunca
// escolhe personagem "so para ganhar ponto". Gera 4 variantes
// DETERMINISTICAS de HOOK a partir de dados reais (evidence/desireProfile/
// benefitPlans - nunca copy hardcoded por produto), avalia cada uma
// substituindo SOMENTE a cena de HOOK no storyboard real e rodando o MESMO
// scoreStoryboard usado em todo o resto do sistema (nunca um scorer
// paralelo), e decide se alguma alternativa representa uma MELHORA
// MATERIAL - nunca so um bonus mecanico de "personagem presente".
//
// Thresholds de decisao fixados AQUI, ANTES de rodar qualquer DRY_RUN real
// contra a campanha Kokeshi - nunca ajustados depois para forcar um
// resultado (mesma regra de todo o Commercial Persuasion Quality Gate).

import { resolveEnvironmentDescription } from "@/lib/commercial-video/persuasion/persuasion-storyboard-builder";
import { scoreStoryboard } from "@/lib/commercial-video/persuasion/scorer";
import type {
  BenefitVisualizationPlan,
  HookOptimizationDecision,
  HookVariantConcept,
  HookVariantEvaluation,
  HookVariantId,
  PersuasionEvidence,
  PersuasionSceneConcept,
  PersuasionStoryboard,
  ProductDesireProfile,
  PurchaseMotivationAnswers,
  ScoredStoryboard,
} from "@/lib/commercial-video/persuasion/types";

function formatPriceBRL(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

function isPresenterVariant(variantId: HookVariantId): boolean {
  return variantId === "D_PRESENTER_CONTROL";
}

// Prefere uma claim de textura/aplicacao/sensorial real (DEMONSTRATION)
// para o Hook B - cai para a primeira claim disponivel se nao houver uma
// assim (nunca inventa uma claim nova).
function pickDemonstrationClaim(benefitPlans: BenefitVisualizationPlan[]): BenefitVisualizationPlan | null {
  return benefitPlans.find((p) => p.demonstrationType === "DEMONSTRATION") ?? benefitPlans[0] ?? null;
}

/**
 * Gera as 4 variantes de HOOK pedidas (A baseline / B produto+contexto
 * humano sem apresentadora obrigatoria / C preco-descoberta / D
 * apresentadora como CONTROLE, com relacao concreta com o produto - nunca
 * so "na tela").
 */
export function generateHookVariantConcepts(
  baselineHookScene: PersuasionSceneConcept,
  evidence: PersuasionEvidence,
  desireProfile: ProductDesireProfile,
  benefitPlans: BenefitVisualizationPlan[],
): HookVariantConcept[] {
  const environmentDescription = resolveEnvironmentDescription(desireProfile.productCategory);
  const demoClaim = pickDemonstrationClaim(benefitPlans);
  const priceLine = evidence.price !== null ? formatPriceBRL(evidence.price) : "preco indisponivel";

  const variants: HookVariantConcept[] = [];

  // --- A) CURRENT (baseline exato, nunca reescrito) -----------------------
  variants.push({
    variantId: "A_CURRENT",
    label: "HOOK atual (baseline)",
    scene: baselineHookScene,
    rationale: "Mantido exatamente como o storyboard real ja propoe - serve de linha de base para todas as comparacoes.",
  });

  // --- B) PRODUCT + HUMAN CONTEXT (nao obrigatoriamente apresentadora) ----
  variants.push({
    variantId: "B_PRODUCT_HUMAN_CONTEXT",
    label: "Produto + contexto humano (mao aplicando, sem apresentadora)",
    scene: {
      sceneId: "hook-b-product-human-context",
      order: 1,
      purpose: "HOOK",
      durationSecondsHint: 2,
      arcStage: "ATTENTION",
      productVisualRole: demoClaim?.demonstrationType === "DEMONSTRATION" ? "DEMONSTRATION" : "EXPERIENCE",
      productInteraction: "APPLIED",
      environmentDescription,
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
      environmentJustification: "Mao aplicando o produto real na pele, contexto autentico de rotina de skincare - nunca so estetica parada.",
      characterNarrativeRole: "DEMONSTRATOR",
      characterPerformanceIntent: {
        narrativeRole: "DEMONSTRATOR",
        sceneObjective: `Mostrar ${demoClaim?.benefit.toLowerCase() ?? "o produto"} sendo aplicado de verdade, nao so posado.`,
        relationshipToProduct: "Mao aplicando o creme real na pele.",
        eyeDirection: "produto/pele",
        gestureIntent: "aplicar produto real",
        productInteractionIntent: "APPLIED",
        emotionalTone: "sensorial, presente",
        transitionContribution: "Continuidade direta com a cena de demonstracao seguinte - nunca uma apresentadora nova introduzida do nada.",
      },
      benefitClaimId: demoClaim?.evidence?.id ?? null,
      salesAngleAlignment: true,
      offerRole: "NONE",
      ctaRole: "NONE",
      overlayCategories: ["HOOK_TEXT"],
      whyContinueWatching: demoClaim ? `${demoClaim.benefit} - aplicado agora, na pele.` : "Aplicacao real do produto, agora.",
      narrationIntent: "Curiosidade sensorial real (textura/aplicacao), nunca generica.",
      suggestedNarration: demoClaim ? demoClaim.benefit : "Veja a aplicacao real.",
      visualConcept: "Mao aplicando o produto real na pele, close-up sensorial, ambiente de rotina real.",
      consumerState: "curiosidade sensorial",
      persuasionObjective: "Parar o scroll com uma demonstracao real e imediata do produto, nao so estetica.",
    },
    rationale: "Explora presenca humana relevante ao contexto (mao aplicando o produto) sem introduzir uma apresentadora completa - testa se 'contexto humano real' sozinho ja resolve o gap de humanInterest.",
  });

  // --- C) PRICE / DISCOVERY (preco real como gatilho central) -------------
  variants.push({
    variantId: "C_PRICE_DISCOVERY",
    label: "Preco como descoberta (curiosidade de valor)",
    scene: {
      sceneId: "hook-c-price-discovery",
      order: 1,
      purpose: "HOOK",
      durationSecondsHint: 2,
      arcStage: "ATTENTION",
      productVisualRole: "PACKSHOT",
      productInteraction: "HELD",
      environmentDescription,
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
      environmentJustification: "Produto real segurado, preco real como gatilho central de curiosidade (PRODUCT_DISCOVERY/SURPRISING_FIND) - nunca desconto inventado.",
      characterNarrativeRole: "NONE",
      characterPerformanceIntent: null,
      benefitClaimId: null,
      salesAngleAlignment: true,
      offerRole: "SETUP",
      ctaRole: "NONE",
      overlayCategories: ["HOOK_TEXT"],
      whyContinueWatching: "Quanto sera que custa esse creme facial?",
      narrationIntent: "Curiosidade de preco real como gatilho central, nunca desconto/urgencia falsa.",
      suggestedNarration: `Quanto voce acha que custa isso? (spoiler: ${priceLine})`,
      visualConcept: "Produto real em maos, preco ainda oculto - lacuna de curiosidade resolvida na cena de OFFER.",
      consumerState: "curiosidade de preco",
      persuasionObjective: "Criar uma lacuna de curiosidade especifica sobre o preco real, sem inventar desconto/urgencia.",
    },
    rationale: "Explora o proprio preco real (sem desconto) como o gatilho central do hook, distinto do hook atual (que combina ingrediente+preco) - testa se isolar a curiosidade de preco sozinha muda o resultado.",
  });

  // --- D) PRESENTER, SOMENTE COMO CONTROLE --------------------------------
  variants.push({
    variantId: "D_PRESENTER_CONTROL",
    label: "Apresentadora no HOOK (controle) - com relacao concreta com o produto",
    scene: {
      sceneId: "hook-d-presenter-control",
      order: 1,
      purpose: "HOOK",
      durationSecondsHint: 2,
      arcStage: "ATTENTION",
      productVisualRole: demoClaim?.demonstrationType === "DEMONSTRATION" ? "DEMONSTRATION" : "EXPERIENCE",
      productInteraction: "APPLIED",
      environmentDescription,
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
      environmentJustification: "Apresentadora aplicando o produto real na propria pele - relacao concreta, nunca so presenca na tela com produto flutuando ao lado.",
      characterNarrativeRole: "HOOK_PRESENTER",
      characterPerformanceIntent: {
        narrativeRole: "HOOK_PRESENTER",
        sceneObjective: "Reagir/descobrir o produto real ao aplica-lo, nao so apresentar.",
        relationshipToProduct: "Aplica o creme real no proprio rosto.",
        eyeDirection: "produto, depois camera",
        gestureIntent: "aplicar e reagir",
        productInteractionIntent: "APPLIED",
        emotionalTone: "curiosa, surpresa positiva",
        transitionContribution: "Estabelece a apresentadora desde o inicio - continuidade com os papeis PRODUCT_GUIDE/DEMONSTRATOR das cenas seguintes.",
      },
      benefitClaimId: demoClaim?.evidence?.id ?? null,
      salesAngleAlignment: true,
      offerRole: "NONE",
      ctaRole: "NONE",
      overlayCategories: ["HOOK_TEXT"],
      whyContinueWatching: `Ela testando um creme de ${priceLine} - vale a pena?`,
      narrationIntent: "Curiosidade via reacao real da apresentadora, nunca so presenca decorativa.",
      suggestedNarration: demoClaim ? `Vou testar esse aqui - ${demoClaim.benefit.toLowerCase()}.` : "Vou testar esse aqui.",
      visualConcept: "Apresentadora aplicando o produto real no proprio rosto, reacao autentica.",
      consumerState: "curiosidade + confianca social",
      persuasionObjective: "Usar a apresentadora como prova/reacao real (aplicando o produto), nunca so decoracao ao lado do produto flutuando.",
    },
    rationale: "Variante de CONTROLE explicita - testa se personagem no hook realmente melhora o resultado de forma material, ou so aciona um bonus mecanico de humanInterest sem mudanca qualitativa real.",
  });

  return variants;
}

const FIRST_SECOND_SIGNAL_KEYWORDS: Array<{ signal: string; test: (scene: PersuasionSceneConcept) => boolean }> = [
  { signal: "produto relevante em uso real (nao so posado)", test: (s) => s.productInteraction === "APPLIED" || s.productInteraction === "DEMONSTRATED" },
  { signal: "interacao humana real com o produto", test: (s) => s.characterNarrativeRole !== "NONE" && s.productInteraction !== "NONE" },
  { signal: "beneficio/desejo real e especifico sendo sugerido", test: (s) => s.benefitClaimId !== null },
  { signal: "preco real como curiosidade concreta em aberto", test: (s) => s.offerRole !== "NONE" },
  { signal: "descoberta/curiosidade explicita no gancho textual", test: (s) => s.whyContinueWatching.includes("?") },
];

function resolveFirstSecondSignal(scene: PersuasionSceneConcept): { signal: string; weak: boolean } {
  const matched = FIRST_SECOND_SIGNAL_KEYWORDS.filter((k) => k.test(scene));
  if (matched.length === 0) {
    return { signal: "nenhum sinal concreto alem de estetica visual (fraco)", weak: true };
  }
  return { signal: matched.map((m) => m.signal).join("; "), weak: false };
}

function describeWhyViewerWouldStop(scene: PersuasionSceneConcept): string {
  const parts: string[] = [];
  if (scene.characterNarrativeRole !== "NONE" && scene.productInteraction === "APPLIED") parts.push("ve uma pessoa real aplicando o produto, nao so segurando");
  else if (scene.characterNarrativeRole !== "NONE") parts.push("ve uma pessoa real presente na cena");
  if (scene.productVisualRole === "DEMONSTRATION" || scene.productVisualRole === "EXPERIENCE") parts.push("ve o produto sendo demonstrado de verdade (textura/aplicacao), nao so posado");
  if (scene.offerRole !== "NONE") parts.push("percebe uma pergunta de preco em aberto (curiosidade de valor real)");
  if (scene.benefitClaimId !== null) parts.push("ve um beneficio real e especifico sendo sugerido, nao generico");
  if (parts.length === 0) return "porque a cena e visualmente bonita (fraco - nenhum gatilho concreto alem de estetica)";
  return parts.join("; ");
}

function describeWhyViewerWouldKeepWatching(scene: PersuasionSceneConcept): string {
  if (scene.offerRole !== "NONE") return "quer saber se o preco real vai confirmar a curiosidade criada";
  if (scene.benefitClaimId !== null && scene.productInteraction === "APPLIED") return "quer ver se o beneficio demonstrado realmente se confirma";
  if (scene.characterNarrativeRole !== "NONE") return "quer ver a reacao/continuacao da pessoa real presente";
  return "razao de continuar fraca - sem gancho especifico de continuidade";
}

function describeWhatTheyWantToKnowNext(scene: PersuasionSceneConcept): string {
  if (scene.offerRole === "SETUP") return "quanto custa de verdade";
  if (scene.benefitClaimId !== null) return "se o beneficio sugerido (textura/aplicacao) e real quando ela usar o produto";
  return "o que o produto realmente faz";
}

export type EvaluateHookVariantInput = {
  variant: HookVariantConcept;
  baselineStoryboard: PersuasionStoryboard;
  evidence: PersuasionEvidence;
  desireProfile: ProductDesireProfile;
  motivationAnswers: PurchaseMotivationAnswers;
};

export type HookVariantEvaluationWithScored = HookVariantEvaluation & { scoredStoryboard: ScoredStoryboard };

/**
 * Substitui SOMENTE a cena de HOOK (primeira cena) do storyboard real pela
 * variante candidata, e roda o MESMO scoreStoryboard usado em todo o
 * sistema - nunca um scorer paralelo, nunca pesos diferentes.
 */
export function evaluateHookVariant(input: EvaluateHookVariantInput): HookVariantEvaluationWithScored {
  const { variant, baselineStoryboard, evidence, desireProfile, motivationAnswers } = input;

  const candidateScenes = [variant.scene, ...baselineStoryboard.scenes.slice(1)];
  const candidateStoryboard: PersuasionStoryboard = { ...baselineStoryboard, scenes: candidateScenes };

  const scored = scoreStoryboard(`HOOK_${variant.variantId}`, candidateStoryboard, evidence, desireProfile, motivationAnswers);
  const claimSafetyCheck = scored.qualityGate.checks.find((c) => c.name === "CLAIM_SAFETY");
  const { signal: firstSecondSignal, weak } = resolveFirstSecondSignal(variant.scene);

  const metrics = {
    hookPersuasion: scored.hookPersuasion.score,
    scrollStopPower: scored.scrollStop.score,
    desireContribution: scored.desireScore,
    productRelevance: scored.scrollStop.components.productRelevance,
    firstSecondEventStrength: scored.scrollStop.components.firstSecondEventStrength,
    specificity: scored.scrollStop.components.specificity,
    priceCuriosity: scored.scrollStop.components.priceCuriosity,
    humanInterest: scored.scrollStop.components.humanInterest,
    motionInterest: scored.scrollStop.components.motionInterest,
    curiosityGap: scored.scrollStop.components.curiosityGap,
    visualInterrupt: scored.scrollStop.components.visualInterrupt,
    genericAdRisk: scored.genericAdRisk.riskLevel,
    claimSafety: claimSafetyCheck ? claimSafetyCheck.status : "FAIL",
    characterIntegration: scored.characterIntegration.score,
    contextRelevance: scored.contextRelevance.score,
  };

  return {
    variantId: variant.variantId,
    label: variant.label,
    scene: variant.scene,
    metrics,
    whyViewerWouldStop: describeWhyViewerWouldStop(variant.scene),
    whyViewerWouldKeepWatching: describeWhyViewerWouldKeepWatching(variant.scene),
    whatTheyWantToKnowNext: describeWhatTheyWantToKnowNext(variant.scene),
    firstSecondSignal,
    weak,
    scoredStoryboard: scored,
  };
}

// Thresholds de decisao - FIXADOS antes de rodar o DRY_RUN real contra
// Kokeshi (nunca ajustados depois para forcar PASS). Um bonus mecanico de
// "personagem presente" sozinho (~+3 no scrollStop, ver scroll-stop-engine.ts
// humanInterest 35->65 * peso 0.1) NUNCA deve contar como melhora material -
// por isso o minimo e 5, nao 1.
export const MIN_SCROLL_STOP_DELTA_FOR_MATERIAL_IMPROVEMENT = 5;
export const MIN_DIMENSIONS_IMPROVED_OR_KEPT = 3; // de 4: hookPersuasion, scrollStop, desireScore, contextRelevance
// Quando duas variantes materialmente melhores empatam (dentro desta
// margem), a preferencia vai para quem NAO introduz uma apresentadora
// completa - nunca o inverso (item explicito do pedido: "nao colocar
// personagem no HOOK apenas para ganhar score").
export const NON_PRESENTER_TIE_BREAK_MARGIN = 2;

export function decideHookOptimization(evaluations: HookVariantEvaluationWithScored[]): HookOptimizationDecision {
  const baseline = evaluations.find((e) => e.variantId === "A_CURRENT");
  if (!baseline) throw new Error("Avaliacao do HOOK A (baseline) e obrigatoria.");

  const candidates = evaluations.filter((e) => e.variantId !== "A_CURRENT");

  const materialCandidates = candidates
    .map((candidate) => {
      const scrollStopDelta = candidate.metrics.scrollStopPower - baseline.metrics.scrollStopPower;
      const dimensionChecks = [
        candidate.metrics.hookPersuasion >= baseline.metrics.hookPersuasion,
        candidate.metrics.scrollStopPower >= baseline.metrics.scrollStopPower,
        candidate.metrics.desireContribution >= baseline.metrics.desireContribution,
        candidate.metrics.contextRelevance >= baseline.metrics.contextRelevance,
      ];
      const dimensionsImprovedOrKept = dimensionChecks.filter(Boolean).length;
      const noRiskRegression = candidate.metrics.genericAdRisk !== "HIGH" && candidate.metrics.claimSafety !== "FAIL";
      const materialImprovement = scrollStopDelta >= MIN_SCROLL_STOP_DELTA_FOR_MATERIAL_IMPROVEMENT && dimensionsImprovedOrKept >= MIN_DIMENSIONS_IMPROVED_OR_KEPT && noRiskRegression;
      return { candidate, scrollStopDelta, dimensionsImprovedOrKept, materialImprovement };
    })
    .filter((c) => c.materialImprovement);

  if (materialCandidates.length === 0) {
    return {
      selectedVariant: "A_CURRENT",
      baselineScore: baseline.metrics.scrollStopPower,
      candidateScore: baseline.metrics.scrollStopPower,
      scoreDelta: 0,
      materialImprovement: false,
      reasons: [
        `Nenhuma variante alternativa atingiu melhora material (delta minimo de ${MIN_SCROLL_STOP_DELTA_FOR_MATERIAL_IMPROVEMENT} pontos em SCROLL_STOP_POWER + pelo menos ${MIN_DIMENSIONS_IMPROVED_OR_KEPT}/4 dimensoes mantidas ou melhoradas + sem regressao de risco).`,
        ...candidates.map((c) => `${c.variantId}: scrollStopDelta=${c.metrics.scrollStopPower - baseline.metrics.scrollStopPower} (${c.metrics.scrollStopPower} vs baseline ${baseline.metrics.scrollStopPower}).`),
      ],
      tradeoffs: ["Mantendo o HOOK atual - se o threshold de SCROLL_STOP_POWER nao for atingido, o gate deve permanecer honesto (FAIL/observacao), nunca contornado trocando o hook so por um bonus mecanico."],
    };
  }

  // Ordena por scrollStopDelta desc; em empate dentro da margem, prefere a
  // variante que NAO usa uma apresentadora completa (nunca o inverso).
  materialCandidates.sort((a, b) => b.scrollStopDelta - a.scrollStopDelta);
  let winner = materialCandidates[0];
  for (const contender of materialCandidates.slice(1)) {
    const withinTieMargin = Math.abs(contender.scrollStopDelta - winner.scrollStopDelta) <= NON_PRESENTER_TIE_BREAK_MARGIN;
    const winnerUsesPresenter = isPresenterVariant(winner.candidate.variantId);
    const contenderUsesPresenter = isPresenterVariant(contender.candidate.variantId);
    if (withinTieMargin && winnerUsesPresenter && !contenderUsesPresenter) {
      winner = contender;
    }
  }

  return {
    selectedVariant: winner.candidate.variantId,
    baselineScore: baseline.metrics.scrollStopPower,
    candidateScore: winner.candidate.metrics.scrollStopPower,
    scoreDelta: winner.scrollStopDelta,
    materialImprovement: true,
    reasons: [
      `${winner.candidate.variantId} melhora SCROLL_STOP_POWER em ${winner.scrollStopDelta} pontos (${baseline.metrics.scrollStopPower} -> ${winner.candidate.metrics.scrollStopPower}), com ${winner.dimensionsImprovedOrKept}/4 dimensoes-chave mantidas ou melhoradas, sem regressao de GenericAiAdRisk/ClaimSafety.`,
      winner.candidate.whyViewerWouldStop,
    ],
    tradeoffs: isPresenterVariant(winner.candidate.variantId)
      ? ["Introduz uma apresentadora completa no HOOK - so selecionada porque nenhuma alternativa sem apresentadora atingiu o mesmo resultado dentro da margem de empate."]
      : [],
  };
}
