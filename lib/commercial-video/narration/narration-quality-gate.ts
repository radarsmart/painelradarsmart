// Radar Creative AI - Narration Script Builder / Quality Gate
//
// PURO - avalia um NarrationPlan ja pronto. Nunca mede audio de verdade
// (isso e o AudioQualityGate, depois do TTS real) - aqui e so consistencia
// do PLANO: bloqueios, duplicacao e textos vazios inesperados.

import type { NarrationPlan, NarrationQualityResult } from "@/lib/commercial-video/narration/types";

function normalizeForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, "");
}

export function assessNarrationQuality(plan: NarrationPlan): NarrationQualityResult {
  const reasons: string[] = [];

  const blockedScenes = plan.scenes.filter(
    (s) => s.status === "BLOCKED_CLAIM" || s.status === "BLOCKED_MISSING_DATA" || s.status === "TOO_LONG",
  );
  for (const scene of blockedScenes) {
    reasons.push(`${scene.sceneId} (${scene.purpose}): ${scene.status} - ${scene.reason}`);
  }

  const readyScenes = plan.scenes.filter((s) => s.status === "READY");

  const emptyTextButReady = readyScenes.filter((s) => !s.text || s.text.trim().length === 0);
  for (const scene of emptyTextButReady) {
    reasons.push(`${scene.sceneId}: status READY mas texto vazio - inconsistencia interna.`);
  }

  const normalizedTexts = readyScenes.map((s) => normalizeForComparison(s.text as string));
  const uniqueTexts = new Set(normalizedTexts);
  const hasDuplication = uniqueTexts.size < normalizedTexts.length;
  if (hasDuplication) {
    reasons.push("Duplicacao de texto detectada entre cenas READY (o comercial repetiria a mesma frase).");
  }

  let status: NarrationQualityResult["status"];
  if (blockedScenes.length > 0 || emptyTextButReady.length > 0) {
    status = "FAIL";
  } else if (hasDuplication) {
    status = "PASS_WITH_OBSERVATIONS";
  } else {
    status = "PASS";
  }

  return { status, reasons };
}
