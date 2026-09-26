// Radar Creative AI - Product Intelligence Grounding V1 - Environment Contamination Trace
//
// PURO, SOMENTE LEITURA - prova (nunca assume, item 10 do pedido: "Nao
// assumir. Provar pelo codigo/dados.") a cadeia causal entre
// product_intelligence.category e o ambiente errado (academia) chamando
// DIRETAMENTE as funcoes reais de producao ja usadas pelo Commercial
// Director V1/V2 (selectVisualStyle, buildVisualWorldDirection) - nunca
// reimplementa/adivinha a logica delas. Essas funcoes sao puras e sem
// efeito colateral - chama-las aqui e seguro (mesmo padrao de reuso ja
// usado por current-v2-adapter.ts na tarefa anterior).

import { selectVisualStyle } from "@/lib/commercial-director/creative-style";
import { buildVisualWorldDirection } from "@/lib/creative-director-v2/decision-engine/visual-world";
import type { EnvironmentContaminationTrace, EnvironmentContaminationTraceStep, GroundedClaim, ProductCategoryGroundingResult } from "@/lib/product-intelligence-grounding/types";

export type BuildEnvironmentContaminationTraceInput = {
  declaredCategory: string;
  categoryGrounding: ProductCategoryGroundingResult;
  contaminatedClaims: GroundedClaim[];
  realVisualWorld: string | null; // creative_brief.commercialDirectionV2.visualWorld real, se disponivel
  realEnvironmentDescriptions: string[]; // v2.sceneBlueprints[].environmentDirection reais, se disponivel
};

export function buildEnvironmentContaminationTrace(input: BuildEnvironmentContaminationTraceInput): EnvironmentContaminationTrace {
  const { declaredCategory, categoryGrounding, contaminatedClaims, realVisualWorld, realEnvironmentDescriptions } = input;
  const steps: EnvironmentContaminationTraceStep[] = [];

  steps.push({
    step: 1,
    stage: "SOURCE",
    description: `product_intelligence.category (persistido, declarado) = "${declaredCategory}".`,
    evidence: [`product_intelligence.category = "${declaredCategory}"`],
    codeReference: null,
  });

  steps.push({
    step: 2,
    stage: "PRODUCT_INTELLIGENCE",
    description: `Category grounding desta tarefa classificou a categoria declarada como ${categoryGrounding.status}.`,
    evidence: [categoryGrounding.reason],
    codeReference: "lib/product-intelligence-grounding/category-grounding.ts",
  });

  steps.push({
    step: 3,
    stage: "CLAIM_CLASSIFICATION",
    description: `${contaminatedClaims.length} claim(s) de product_intelligence classificada(s) CONTAMINATED (linguagem de dominio incompativel com a identidade real do produto).`,
    evidence: contaminatedClaims.slice(0, 8).map((c) => `[${c.field}] "${c.originalText}" - dominio detectado: ${c.claimClusters.join(", ")}`),
    codeReference: "lib/product-intelligence-grounding/claim-domain-grounding.ts",
  });

  // Chama a FUNCAO REAL de producao (nunca reimplementada) para provar,
  // nao supor, qual visualStyle a categoria declarada realmente produz.
  const { style: expectedVisualStyle, reason: visualStyleReason } = selectVisualStyle(declaredCategory);
  const visualWorldMatchesExpected = realVisualWorld !== null && realVisualWorld === expectedVisualStyle;

  steps.push({
    step: 4,
    stage: "CREATIVE_DECISION",
    description: `selectVisualStyle("${declaredCategory}") (funcao REAL de producao, chamada diretamente por esta tarefa) retorna visualStyle="${expectedVisualStyle}". ${realVisualWorld !== null ? `Valor real persistido em creative_brief.commercialDirectionV2.visualWorld = "${realVisualWorld}" - ${visualWorldMatchesExpected ? "CONFIRMA" : "NAO CONFIRMA"} a cadeia.` : "Nenhum v2 real fornecido para comparar."}`,
    evidence: [visualStyleReason, ...(realVisualWorld !== null ? [`creative_brief.commercialDirectionV2.visualWorld = "${realVisualWorld}"`] : [])],
    codeReference: "lib/commercial-director/creative-style.ts#selectVisualStyle (CATEGORY_VISUAL_STYLE)",
  });

  const realWorldDirection = buildVisualWorldDirection(expectedVisualStyle);
  const environmentTextOverlap = realEnvironmentDescriptions.some(
    (desc) => desc.includes(realWorldDirection.backgroundContinuity) || desc.includes(realWorldDirection.materialLanguage) || desc.includes(realWorldDirection.motionLanguage),
  );

  steps.push({
    step: 5,
    stage: "ENVIRONMENT",
    description: `buildVisualWorldDirection("${expectedVisualStyle}") (funcao REAL de producao) retorna backgroundContinuity="${realWorldDirection.backgroundContinuity}", materialLanguage="${realWorldDirection.materialLanguage}", motionLanguage="${realWorldDirection.motionLanguage}". ${realEnvironmentDescriptions.length > 0 ? `${environmentTextOverlap ? "CONFIRMADO" : "NAO CONFIRMADO"}: texto real de environmentDirection das cenas ${environmentTextOverlap ? "contem" : "NAO contem"} esse texto.` : "Nenhuma environmentDirection real fornecida para comparar."}`,
    evidence: [
      `backgroundContinuity="${realWorldDirection.backgroundContinuity}"`,
      `materialLanguage="${realWorldDirection.materialLanguage}"`,
      `motionLanguage="${realWorldDirection.motionLanguage}"`,
      ...realEnvironmentDescriptions.slice(0, 5).map((d) => `environmentDirection real: "${d}"`),
    ],
    codeReference: "lib/creative-director-v2/decision-engine/visual-world.ts#buildVisualWorldDirection (WORLD_BY_VISUAL_STYLE)",
  });

  const proven = visualWorldMatchesExpected && environmentTextOverlap && categoryGrounding.status === "CONTRADICTED";

  const conclusion = proven
    ? `CADEIA CAUSAL PROVADA POR CODIGO/DADOS: product_intelligence.category="${declaredCategory}" (${categoryGrounding.status}) -> selectVisualStyle() retorna "${expectedVisualStyle}" -> buildVisualWorldDirection() produz o ambiente real observado nas cenas. A contaminacao de categoria e a causa raiz code-provada do ambiente incorreto, nao uma decisao criativa independente do Creative Director V2.`
    : `Cadeia NAO totalmente confirmada com os dados fornecidos (categoryGrounding=${categoryGrounding.status}, visualWorldMatch=${visualWorldMatchesExpected}, environmentTextOverlap=${environmentTextOverlap}) - reportar como PLAUSIVEL, nunca como provado, quando algum elo nao pode ser confirmado.`;

  return { proven, steps, conclusion };
}
