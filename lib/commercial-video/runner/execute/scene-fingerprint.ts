// Radar Creative AI - Commercial Generation Runner / EXECUTE Fingerprints
//
// PURO - identidade determinística do que SERIA gerado, usada so pra
// decidir REUSO (item 26/27 do enunciado): mesmo fingerprint entre duas
// execucoes = mesma geracao, nunca paga de novo. Fingerprint DIFERENTE
// (prompt mudou, provider mudou, referencia mudou) forca uma nova
// decisao - nunca reusa por engano so porque sceneId bateu (ver item 27:
// "nao usar so sceneId como chave").

import crypto from "node:crypto";

import type { SceneExecutionPlan } from "@/lib/generation-orchestrator/types";
import type { SceneAssetCandidate } from "@/lib/commercial-video/scene-asset-types";

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Fingerprint de UMA cena de video - inclui exatamente os campos que, se
 * mudassem, deveriam produzir um resultado visual diferente (prompt,
 * negativePrompt, provider, referencias, duracao). Nunca inclui
 * sceneId sozinho como se fosse suficiente.
 */
export function computeSceneFingerprint(scene: SceneExecutionPlan): string {
  return hashJson({
    provider: scene.selectedProvider,
    capability: scene.providerCapability,
    positivePrompt: scene.positivePrompt,
    negativePrompt: scene.negativePrompt,
    productReferenceUrl: scene.productReferenceUrl,
    identityReferenceUrl: scene.identityReferenceUrl,
    supportReferenceUrl: scene.supportReferenceUrl,
    durationSeconds: scene.durationSeconds,
    aspectRatio: scene.aspectRatio,
    productGenerationStrategy: scene.productGenerationStrategy,
    hybridCompositePlan: scene.hybridCompositePlan,
  });
}

/**
 * Fingerprint de UMA fala de narracao - texto + voz + modelo. Trocar
 * qualquer um dos tres invalida o reuso (ver item 27).
 */
export function computeNarrationFingerprint(text: string, voiceId: string, model: string): string {
  return hashJson({ text, voiceId, model });
}

function candidateFingerprint(candidate: SceneAssetCandidate): string | null | undefined {
  if (candidate.source === "GENERATION_RESULT" || candidate.source === "HYBRID_COMPOSITE") {
    return candidate.fingerprint;
  }
  return undefined;
}

/**
 * So usado em EXECUTE (DRY_RUN nunca chama isto). Candidato SEM
 * fingerprint (ex: LOCAL_ASSET/MOCK, ou um GENERATION_RESULT antigo de
 * antes do EXECUTE V1 existir) passa direto - nunca rejeitado so por nao
 * ter o campo. Candidato COM fingerprint so passa se bater com o
 * fingerprint da cena ATUAL (prompt/provider/referencia iguais) - ver
 * item 27 do enunciado ("fingerprint diferente forca nova decisao").
 */
export function filterCandidatesByFingerprint(
  candidates: SceneAssetCandidate[],
  currentFingerprints: Record<string, string>,
): SceneAssetCandidate[] {
  return candidates.filter((candidate) => {
    const fingerprint = candidateFingerprint(candidate);
    if (fingerprint === null || fingerprint === undefined) return true;
    return fingerprint === currentFingerprints[candidate.sceneId];
  });
}
