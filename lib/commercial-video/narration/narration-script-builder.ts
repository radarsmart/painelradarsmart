// Radar Creative AI - Narration Script Builder V1
//
// PURO - unico orquestrador desta camada. Recebe CampaignPromptPlan (que
// ja embute CommercialDirection + SceneGenerationPrompt por cena) mais
// dados reais da oferta/Product Intelligence, e devolve um NarrationPlan
// completo. NUNCA chama ElevenLabs/nenhum provider - o resultado so serve
// de insumo pra uma fase futura que consumiria createGarotaRadarNarrationProvider().

import type { CampaignPromptPlan, SceneGenerationPrompt } from "@/lib/prompt-builder/types";
import { computeMaxCharacters, estimateSpeechSeconds } from "@/lib/commercial-video/narration/narration-duration-budget";
import { checkCandidateClaimsSafety } from "@/lib/commercial-video/narration/narration-claims-guard";
import { generateCandidatesForScene } from "@/lib/commercial-video/narration/narration-copy-templates";
import type {
  NarrationOfferData,
  NarrationPlan,
  NarrationProductData,
  NarrationSceneOptions,
  NarrationSceneScript,
} from "@/lib/commercial-video/narration/types";

export function buildNarrationSceneScript(
  scene: SceneGenerationPrompt,
  direction: CampaignPromptPlan["commercialDirection"],
  offer: NarrationOfferData,
  product: NarrationProductData | null,
  category: string,
  options: NarrationSceneOptions = {},
): NarrationSceneScript {
  const base = {
    sceneId: scene.sceneId,
    sceneOrder: scene.sceneOrder,
    purpose: scene.purpose,
    durationSeconds: scene.durationSeconds,
    maxCharacters: computeMaxCharacters(scene.durationSeconds),
  };

  if (options.forceSilent) {
    return {
      ...base,
      text: null,
      estimatedSpeechSeconds: null,
      status: "SILENT",
      reason: null,
      candidatesConsidered: 0,
    };
  }

  const candidates = generateCandidatesForScene(scene, direction, offer, product);

  if (candidates.length === 0) {
    return {
      ...base,
      text: null,
      estimatedSpeechSeconds: null,
      status: "BLOCKED_MISSING_DATA",
      reason: `Nenhum dado real disponivel pra narrar o purpose "${scene.purpose}" desta cena.`,
      candidatesConsidered: 0,
    };
  }

  let shortestClaimsSafe: string | null = null;
  let firstViolationSummary: string | null = null;
  let consideredCount = 0;

  for (const candidate of candidates) {
    consideredCount += 1;
    const claimsCheck = checkCandidateClaimsSafety(candidate, category);

    if (!claimsCheck.safe) {
      if (!firstViolationSummary) {
        firstViolationSummary = claimsCheck.violations.map((v) => `"${v.matchedText}" (${v.ruleLabel})`).join("; ");
      }
      continue;
    }

    shortestClaimsSafe = candidate;

    if (candidate.length <= base.maxCharacters) {
      return {
        ...base,
        text: candidate,
        estimatedSpeechSeconds: estimateSpeechSeconds(candidate.length),
        status: "READY",
        reason: null,
        candidatesConsidered: consideredCount,
      };
    }
  }

  if (shortestClaimsSafe) {
    return {
      ...base,
      text: shortestClaimsSafe,
      estimatedSpeechSeconds: estimateSpeechSeconds(shortestClaimsSafe.length),
      status: "TOO_LONG",
      reason:
        `Nem o candidato mais curto e seguro (${shortestClaimsSafe.length} caracteres: "${shortestClaimsSafe}") ` +
        `coube no orcamento de ${base.maxCharacters} caracteres para ${base.durationSeconds}s.`,
      candidatesConsidered: consideredCount,
    };
  }

  return {
    ...base,
    text: null,
    estimatedSpeechSeconds: null,
    status: "BLOCKED_CLAIM",
    reason: `Todos os ${consideredCount} candidatos violaram a politica de claims da categoria "${category}": ${firstViolationSummary}.`,
    candidatesConsidered: consideredCount,
  };
}

export type BuildNarrationPlanOptions = {
  sceneOptions?: Record<string, NarrationSceneOptions>;
};

export function buildNarrationPlan(
  campaignId: string,
  promptPlan: CampaignPromptPlan,
  offer: NarrationOfferData,
  product: NarrationProductData | null,
  category: string,
  options: BuildNarrationPlanOptions = {},
): NarrationPlan {
  const orderedScenes = [...promptPlan.scenes].sort((a, b) => a.sceneOrder - b.sceneOrder);

  const scenes = orderedScenes.map((scene) =>
    buildNarrationSceneScript(
      scene,
      promptPlan.commercialDirection,
      offer,
      product,
      category,
      options.sceneOptions?.[scene.sceneId] ?? {},
    ),
  );

  const totalCharacters = scenes.reduce((sum, s) => sum + (s.text?.length ?? 0), 0);
  const blocked = scenes.some((s) => s.status === "BLOCKED_CLAIM" || s.status === "BLOCKED_MISSING_DATA" || s.status === "TOO_LONG");

  return {
    campaignId,
    language: "pt-BR",
    scenes,
    totalCharacters,
    estimatedCredits: totalCharacters,
    status: blocked ? "BLOCKED" : "READY",
  };
}
