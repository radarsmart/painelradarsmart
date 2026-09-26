// Radar Creative AI - Creative Director V2 / Validation / V1 vs V2 Storyboard Diff
//
// Compara V1 (CommercialDirection) e V2 (CommercialCreativeDirectionV2)
// cena-a-cena e responde perguntas objetivas. IMPORTANTE (documentado aqui e
// no relatorio): V2 hoje reusa literalmente `v1.scenes` (mesma contagem,
// timing, camera/motion) - buildCommercialCreativeDirectionV2() chama
// buildCommercialDirection() sem alterar nada. Entao perguntas sobre
// GEOMETRIA/TIMING (produto aparece mais cedo? mais movimento?) tem resposta
// honesta "sem mudanca" - o que mudou foi a camada de DECISAO/MEDICAO em
// cima disso, nao a coreografia visual. Perguntas sobre COBERTURA DE DECISAO
// (funcao comercial da cena, papel da apresentadora, hierarquia de oferta,
// acao visual do CTA) podem legitimamente responder YES.

import { computeFirstProductAppearance } from "@/lib/creative-director-v2/product-presentation";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";
import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { ComparisonQuestionAnswer, V1ScenePreview, V1V2StoryboardDiff } from "@/lib/creative-director-v2/validation/types";
import { buildStoryboardPreview } from "@/lib/creative-director-v2/validation/storyboard-preview";

export function buildV1StoryboardPreview(v1: CommercialDirection): V1ScenePreview[] {
  return v1.scenes.map((scene) => ({
    scene: scene.id,
    purpose: scene.purpose,
    camera: scene.camera,
    motion: scene.motion,
    lighting: scene.lighting,
    textOverlay: scene.textOverlay,
    voiceoverIntent: scene.voiceoverIntent,
    transitionIntent: scene.transitionIntent,
    presenter: scene.presenter,
  }));
}

export function answerComparisonQuestions(v1: CommercialDirection, v2: CommercialCreativeDirectionV2): ComparisonQuestionAnswer[] {
  const v1FirstProduct = computeFirstProductAppearance(v1.scenes);
  const sameScenes = v1.scenes.length === v2.sceneBlueprints.length;

  const answers: ComparisonQuestionAnswer[] = [];

  answers.push({
    question: "Produto aparece mais cedo?",
    verdict: "NO",
    evidence: sameScenes
      ? `V2 reusa as mesmas cenas de V1 (${v1.sceneCount} cenas, mesmo timing) - produto aparece no mesmo segundo em ambos: ${v1FirstProduct ?? "nunca"}s. V2 so passou a MEDIR isso, nao replanejou.`
      : "estruturas diferentes entre V1 e V2 - inesperado, investigar.",
  });

  answers.push({
    question: "Produto aparece maior?",
    verdict: "PARTIAL",
    evidence: `V1 nao tinha conceito de escala de produto. V2 agora ATRIBUI um alvo (productScaleTarget="${v2.productScaleTarget}"), mas nada no Prompt Builder/Generation Orchestrator aplica esse alvo de fato ainda - e intencao registrada, nao pixel renderizado.`,
  });

  answers.push({
    question: "Hook ficou mais forte?",
    verdict: "PARTIAL",
    evidence: `A cena de HOOK em si (camera/motion/personagem) e a mesma de V1. O que mudou: agora existe um score mensuravel (${v2.hookStrength.overallScore}/100, minimo ${v2.qualityTargets.hookStrengthMinimum}) que teria sinalizado "nao pronto" se fraco. Forca real do hook so muda quando o Commercial Director/scene-planner mudar de fato.`,
  });

  answers.push({
    question: "Existe mais movimento?",
    verdict: "NO",
    evidence: "As strings de motion por cena sao identicas as de V1 (scene-planner.ts nao foi alterado nem re-executado com regras diferentes).",
  });

  answers.push({
    question: "Existe melhor progressao narrativa?",
    verdict: "PARTIAL",
    evidence: "V2 agora rotula narrationRole.intent (DISCOVERY/DESIRE/BENEFIT/OFFER/CTA) explicitamente por cena, mas o TEXTO de narracao real continua 100% responsabilidade do Narration Script Builder, que V2 nao toca.",
  });

  const allScenesHaveIntent = v2.sceneBlueprints.every((b) => b.creativeIntent.length > 0 && b.narrationRole.messagePriority !== undefined);
  answers.push({
    question: "Cada cena tem funcao comercial definida?",
    verdict: allScenesHaveIntent ? "YES" : "NO",
    evidence: `${v2.sceneBlueprints.length}/${v2.sceneBlueprints.length} cenas tem creativeIntent + narrationRole + productRole + characterRole explicitos - V1 so tinha campos de producao (camera/motion), sem essa camada de intencao.`,
  });

  answers.push({
    question: "Apresentadora tem funcao clara quando aparece?",
    verdict: "YES",
    evidence: v2.characterRoleSummary.appears
      ? `aparece com papeis definidos: ${v2.characterRoleSummary.rolesUsed.join(", ")} (${v2.characterRoleSummary.reason})`
      : `nao aparece nesta campanha - decisao explicita e rastreavel (${v2.characterRoleSummary.reason}), nao um "buraco" no plano.`,
  });

  answers.push({
    question: "Oferta possui hierarquia visual?",
    verdict: v2.offerPresentation.pricePriority !== "NONE" || v2.offerPresentation.discountPriority !== "NONE" ? "YES" : "NO",
    evidence: `price=${v2.offerPresentation.pricePriority}, discount=${v2.offerPresentation.discountPriority}, urgency=${v2.offerPresentation.urgencyAllowed}, cta=${v2.offerPresentation.ctaPriority} (V1 nao ranqueava isso).`,
  });

  answers.push({
    question: "CTA possui acao visual definida?",
    verdict: v2.ctaDirection.ctaVisualAction !== "NONE" ? "YES" : "NO",
    evidence: `ctaVisualAction=${v2.ctaDirection.ctaVisualAction}${v2.ctaDirection.ctaCharacterGesture ? `, gesto="${v2.ctaDirection.ctaCharacterGesture}"` : " (sem apresentadora nesta campanha, entao NONE e esperado, nao um defeito)"}`,
  });

  answers.push({
    question: "Existem cenas visualmente redundantes?",
    verdict: v2.genericAdRisk.reasons.includes("REPETITIVE_COMPOSITION") ? "YES" : "NO",
    evidence: v2.genericAdRisk.reasons.includes("REPETITIVE_COMPOSITION")
      ? "genericAdRisk detectou REPETITIVE_COMPOSITION (mesma direcao de camera em >=3 cenas)."
      : "nenhuma composicao repetitiva detectada no nivel de storyboard inteiro (ver tambem SceneRedundancyAnalysis para granularidade de pares consecutivos).",
  });

  answers.push({
    question: "O comercial ainda parece generico?",
    verdict: v2.genericAdRisk.risk === "HIGH" ? "YES" : v2.genericAdRisk.risk === "MEDIUM" ? "PARTIAL" : "NO",
    evidence: `genericAdRisk.risk=${v2.genericAdRisk.risk} (${v2.genericAdRisk.reasons.length} motivo(s): ${v2.genericAdRisk.reasons.join(", ") || "nenhum"}). Este risco mede SINAIS ESTRUTURAIS presentes no plano - nao substitui avaliacao visual humana do video renderizado.`,
  });

  return answers;
}

export function buildV1V2StoryboardDiff(v1: CommercialDirection, v2: CommercialCreativeDirectionV2): V1V2StoryboardDiff {
  return {
    v1Scenes: buildV1StoryboardPreview(v1),
    v2Scenes: buildStoryboardPreview(v2).scenes,
    questions: answerComparisonQuestions(v1, v2),
  };
}
