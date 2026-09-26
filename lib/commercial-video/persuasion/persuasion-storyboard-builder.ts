// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Persuasion Storyboard Builder
//
// PURO - propoe um NOVO storyboard (texto puro, NUNCA gera midia) a partir
// de PersuasionEvidence/ProductDesireProfile/SalesAngle REAIS. Item 24 do
// pedido: NAO fica preso a 5 cenas (HOOK/PRODUCT/BENEFIT/OFFER/CTA) - o
// numero de cenas eh derivado de quantas claims REAIS existem para
// demonstrar (nunca preenchido "porque sim"). Quando ha character
// disponivel (useCharacter=true), ela aparece em MAIS de uma cena com
// papeis narrativos distintos - correcao direta do achado
// DISCONNECTED_PRESENTER do CANARY real.

import { generateHookConcepts } from "@/lib/commercial-video/persuasion/hook-persuasion-engine";
import type {
  BenefitVisualizationPlan,
  CharacterNarrativeRole,
  PersuasionEvidence,
  PersuasionSceneConcept,
  PersuasionStoryboard,
  ProductDesireProfile,
  SalesAngleCandidate,
  StructuralLimitationFinding,
} from "@/lib/commercial-video/persuasion/types";

const CATEGORY_NATIVE_ENVIRONMENT: Record<string, string> = {
  beleza: "bancada/banheiro de beleza real, luz natural suave, sem elementos nao relacionados a rotina de cuidado",
  suplementos: "ambiente de treino/rotina fitness real",
  geral: "ambiente domestico neutro, coerente com o uso real do produto",
};

export function resolveEnvironmentDescription(category: string): string {
  return CATEGORY_NATIVE_ENVIRONMENT[category] ?? CATEGORY_NATIVE_ENVIRONMENT.geral;
}

function formatPriceBRL(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

export type BuildPersuasionStoryboardInput = {
  evidence: PersuasionEvidence;
  desireProfile: ProductDesireProfile;
  salesAngle: SalesAngleCandidate;
  benefitPlans: BenefitVisualizationPlan[];
  useCharacter: boolean;
};

export function buildPersuasionStoryboard(input: BuildPersuasionStoryboardInput): { storyboard: PersuasionStoryboard; structuralLimitation: StructuralLimitationFinding } {
  const { evidence, desireProfile, salesAngle, benefitPlans, useCharacter } = input;
  const environmentDescription = resolveEnvironmentDescription(desireProfile.productCategory);
  const hookConcepts = generateHookConcepts(evidence, desireProfile);
  const winningHook = hookConcepts.find((c) => c.grounded) ?? hookConcepts[hookConcepts.length - 1];

  const scenes: PersuasionSceneConcept[] = [];
  let order = 1;

  function characterRoleFor(defaultRole: CharacterNarrativeRole): CharacterNarrativeRole {
    return useCharacter ? defaultRole : "NONE";
  }

  // --- Cena 1: HOOK (ATTENTION) ---------------------------------------
  scenes.push({
    sceneId: `pv1-scene-${order}`,
    order,
    purpose: "HOOK",
    durationSecondsHint: 2,
    arcStage: "ATTENTION",
    productVisualRole: benefitPlans[0]?.demonstrationType ?? "PACKSHOT",
    productInteraction: benefitPlans[0] ? "APPLIED" : "NONE",
    environmentDescription,
    environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
    environmentJustification: `Ambiente escolhido por corresponder a categoria real (${desireProfile.productCategory}), nao a categoria declarada incorretamente em product_intelligence.`,
    characterNarrativeRole: "NONE", // hook comeca no produto/preco, nunca na apresentadora
    characterPerformanceIntent: null,
    benefitClaimId: benefitPlans[0]?.evidence?.id ?? null,
    salesAngleAlignment: true,
    offerRole: winningHook.concept.includes("R$") ? "SETUP" : "NONE",
    ctaRole: "NONE",
    overlayCategories: ["HOOK_TEXT"],
    whyContinueWatching: winningHook.concept,
    narrationIntent: "Curiosidade especifica (preco+categoria correta), nunca generica.",
    suggestedNarration: winningHook.concept,
    visualConcept: `Reveal do produto real com foco imediato em ${benefitPlans[0]?.visualMetaphor ?? "o produto"}.`,
    consumerState: "curiosidade",
    persuasionObjective: "Parar o scroll com especificidade real (preco/textura), nao so estetica.",
  });
  order += 1;

  // --- Cena 2: PRODUCT_REVEAL (INTEREST) -------------------------------
  scenes.push({
    sceneId: `pv1-scene-${order}`,
    order,
    purpose: "PRODUCT",
    durationSecondsHint: 3,
    arcStage: "INTEREST",
    productVisualRole: "PACKSHOT",
    productInteraction: useCharacter ? "HELD" : "NONE",
    environmentDescription,
    environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
    environmentJustification: null,
    characterNarrativeRole: characterRoleFor("PRODUCT_GUIDE"),
    characterPerformanceIntent: useCharacter
      ? {
          narrativeRole: "PRODUCT_GUIDE",
          sceneObjective: "Apresentar o produto real como guia, nao so decoracao.",
          relationshipToProduct: "Segura/mostra o produto real de perto.",
          eyeDirection: "produto, depois camera",
          gestureIntent: "mostrar embalagem real",
          productInteractionIntent: "HELD",
          emotionalTone: "confiante, proxima",
          transitionContribution: "Estabelece continuidade para reaparecer na demonstracao (evita DISCONNECTED_PRESENTER).",
        }
      : null,
    benefitClaimId: null,
    salesAngleAlignment: true,
    offerRole: "NONE",
    ctaRole: "NONE",
    overlayCategories: [],
    whyContinueWatching: `Ver o produto real (${evidence.productName}) de perto.`,
    narrationIntent: "Conectar produto real com a categoria/desejo corretos.",
    suggestedNarration: `Esse aqui e o ${evidence.productName.split(" ").slice(0, 3).join(" ")}.`,
    visualConcept: "Produto real em destaque, embalagem legivel, ambiente coerente com a categoria.",
    consumerState: "interesse",
    persuasionObjective: "Confirmar que o produto e real e relevante para o desejo do hook.",
  });
  order += 1;

  // --- Cenas de BENEFICIO (DESIRE) - uma por claim REAL disponivel -----
  benefitPlans.slice(0, 2).forEach((plan, index) => {
    scenes.push({
      sceneId: `pv1-scene-${order}`,
      order,
      purpose: "BENEFIT",
      durationSecondsHint: 3,
      arcStage: "DESIRE",
      productVisualRole: plan.demonstrationType,
      productInteraction: plan.demonstrationType === "DEMONSTRATION" ? "APPLIED" : "POINTED_AT",
      environmentDescription,
      environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
      environmentJustification: null,
      characterNarrativeRole: characterRoleFor(index === 0 ? "DEMONSTRATOR" : "PRODUCT_GUIDE"),
      characterPerformanceIntent: useCharacter
        ? {
            narrativeRole: index === 0 ? "DEMONSTRATOR" : "PRODUCT_GUIDE",
            sceneObjective: `Demonstrar/expressar o beneficio real: ${plan.benefit}.`,
            relationshipToProduct: plan.productInteraction,
            eyeDirection: "produto/pele, depois camera",
            gestureIntent: plan.demonstrationType === "DEMONSTRATION" ? "aplicar produto" : "apontar ingrediente",
            productInteractionIntent: plan.productInteraction,
            emotionalTone: "satisfeita, sensorial",
            transitionContribution: "Mesma apresentadora do PRODUCT_REVEAL - continuidade narrativa.",
          }
        : null,
      benefitClaimId: plan.evidence?.id ?? null,
      salesAngleAlignment: true,
      offerRole: "NONE",
      ctaRole: "NONE",
      overlayCategories: ["BENEFIT_TEXT"],
      whyContinueWatching: `Descobrir se ${plan.benefit.toLowerCase()} e real.`,
      narrationIntent: "Demonstrar/expressar beneficio real de forma sensorial, nunca prometer resultado nao sustentado.",
      suggestedNarration: plan.benefit,
      visualConcept: plan.visualMetaphor,
      consumerState: "desejo",
      persuasionObjective: `Visualizar o beneficio real (${plan.demonstrationType}), nunca so packshot.`,
    });
    order += 1;
  });

  // --- Cena OFFER (VALUE) ----------------------------------------------
  scenes.push({
    sceneId: `pv1-scene-${order}`,
    order,
    purpose: "OFFER",
    durationSecondsHint: 2,
    arcStage: "VALUE",
    productVisualRole: "PACKSHOT",
    productInteraction: useCharacter ? "HELD" : "NONE",
    environmentDescription,
    environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
    environmentJustification: null,
    characterNarrativeRole: characterRoleFor("OFFER_PRESENTER"),
    characterPerformanceIntent: useCharacter
      ? {
          narrativeRole: "OFFER_PRESENTER",
          sceneObjective: "Revelar/reforcar o preco real como argumento de valor.",
          relationshipToProduct: "Segura o produto junto ao preco.",
          eyeDirection: "camera",
          gestureIntent: "gesto de valor/surpresa positiva com o preco real",
          productInteractionIntent: "HELD",
          emotionalTone: "positiva, sem urgencia falsa",
          transitionContribution: "Prepara a mesma apresentadora para fechar no CTA.",
        }
      : null,
    benefitClaimId: null,
    salesAngleAlignment: true,
    offerRole: evidence.discountPercent && evidence.discountPercent > 0 ? "REVEAL" : "REVEAL",
    ctaRole: "NONE",
    overlayCategories: ["PRICE_TEXT"],
    whyContinueWatching: evidence.price !== null ? `Ver o preco real: ${formatPriceBRL(evidence.price)}.` : "Ver o preco.",
    narrationIntent: "Comunicar preco real como argumento de valor, nunca inventar desconto/urgencia.",
    suggestedNarration: evidence.price !== null ? `Sai por ${formatPriceBRL(evidence.price)}.` : "Confira o preco.",
    visualConcept: "Preco real em destaque via overlay, produto ainda visivel.",
    consumerState: "percepcao de valor",
    persuasionObjective: "Ancorar o preco real como surpresa positiva, nunca 0% OFF nem preco falso.",
  });
  order += 1;

  // --- Cena CTA (ACTION) -------------------------------------------------
  scenes.push({
    sceneId: `pv1-scene-${order}`,
    order,
    purpose: "CTA",
    durationSecondsHint: 3,
    arcStage: "ACTION",
    productVisualRole: "PACKSHOT",
    productInteraction: useCharacter ? "POINTED_AT" : "NONE",
    environmentDescription,
    environmentRelevance: "PRODUCT_NATIVE_CONTEXT",
    environmentJustification: null,
    characterNarrativeRole: characterRoleFor("CTA_CLOSER"),
    characterPerformanceIntent: useCharacter
      ? {
          narrativeRole: "CTA_CLOSER",
          sceneObjective: "Fechar a venda reforcando o que ja foi mostrado (produto+preco), nunca introduzir novidade.",
          relationshipToProduct: "Aponta para o produto/preco ja revelados.",
          eyeDirection: "camera",
          gestureIntent: "convite direto, consistente com o papel de OFFER_PRESENTER da cena anterior",
          productInteractionIntent: "POINTED_AT",
          emotionalTone: "confiante, convidativa",
          transitionContribution: "Mesma apresentadora das cenas 2/3/5 - continuidade narrativa completa, corrige DISCONNECTED_PRESENTER.",
        }
      : null,
    benefitClaimId: null,
    salesAngleAlignment: true,
    offerRole: "REINFORCEMENT",
    ctaRole: "PRIMARY",
    overlayCategories: ["CTA_TEXT"],
    whyContinueWatching: "N/A (cena final).",
    narrationIntent: "Fechar com convite direto, reforcando o que ja foi dito - nunca introduzir informacao nova.",
    suggestedNarration: "Garanta o seu agora.",
    visualConcept: "Produto + preco reforcados, apresentadora (quando presente) consistente com papel anterior.",
    consumerState: "decisao",
    persuasionObjective: "Reduzir friccao e converter, nunca card generico desconectado.",
  });

  const storyboard: PersuasionStoryboard = {
    label: "DESIRE_ENGINE_V1",
    scenes,
    sceneCount: scenes.length,
    salesAngle: salesAngle.angle,
    totalDurationSecondsHint: scenes.reduce((sum, s) => sum + (s.durationSecondsHint ?? 0), 0),
  };

  // Item 24 do pedido: reportar a limitacao estrutural em vez de quebrar a
  // arquitetura atual (Commercial Director V1/Decision Engine mantem
  // SEMPRE a mesma sequencia de purposes de V1 - nunca adiciona/remove
  // cena, ver scene-plan-builder.ts "Mantém a MESMA sequência de purposes
  // de V1").
  const structuralLimitation: StructuralLimitationFinding = {
    code: "STRUCTURAL_LIMITATION_SCENE_COUNT",
    currentArchitectureConstraint:
      "Commercial Director V1 (buildCommercialDirection) e o Decision Engine V2 (scene-plan-builder.ts) mantem SEMPRE a mesma sequencia de 5 purposes de V1 (HOOK/PRODUCT/BENEFIT/OFFER/CTA) - nunca adicionam/removem cena. Essa arquitetura NAO foi alterada nesta tarefa (fora de escopo - so planejamento).",
    desiredSceneCount: scenes.length,
    currentSceneCount: 5,
    recommendation:
      scenes.length === 5
        ? "Nesta campanha (Kokeshi) o numero ideal coincidiu com 5 - nenhuma mudanca estrutural seria necessaria para este caso especifico."
        : `O Desire Engine recomendaria ${scenes.length} cenas para esta campanha (2 cenas de BENEFIT, uma por claim real de embalagem disponivel) - uma tarefa FUTURA precisaria tornar o numero de cenas variavel no Commercial Director/Decision Engine para suportar isso de verdade.`,
  };

  return { storyboard, structuralLimitation };
}
