// Radar Creative AI - Narration Script Builder / Types
//
// Transforma Commercial Direction + dados reais da oferta em COPY curta e
// segura por cena - nunca gera audio, nunca chama TTS. O resultado
// (NarrationPlan) e o unico insumo que futuramente alimentaria
// createGarotaRadarNarrationProvider() por cena - essa ligacao e
// deliberadamente NAO feita nesta fase.

import type { ScenePurpose } from "@/lib/commercial-director/types";

export type NarrationSceneStatus =
  | "READY"
  | "SILENT"
  | "BLOCKED_CLAIM"
  | "BLOCKED_MISSING_DATA"
  | "TOO_LONG";

export type NarrationSceneScript = {
  sceneId: string;
  sceneOrder: number;
  purpose: ScenePurpose;
  // null quando status !== "READY".
  text: string | null;
  durationSeconds: number;
  // Orcamento de caracteres calculado pra essa duracao (ver
  // narration-duration-budget.ts) - nunca um valor fixo hardcoded fora
  // dessa formula.
  maxCharacters: number;
  // Estimativa PURA (chars / taxa observada) - nunca a duracao real de
  // audio (essa so existe depois de uma sintese de verdade, ver
  // narration-track.ts#NarrationSegment.actualDurationSeconds).
  estimatedSpeechSeconds: number | null;
  status: NarrationSceneStatus;
  // Preenchido sempre que status !== "READY" e status !== "SILENT" -
  // motivo exato (claim bloqueada, dado ausente, orcamento estourado).
  reason: string | null;
  // Quantos candidatos de copy foram avaliados antes de decidir - pura
  // traceability/debug, nunca usado pra logica.
  candidatesConsidered: number;
};

export type NarrationPlanStatus = "READY" | "BLOCKED";

export type NarrationPlan = {
  campaignId: string;
  language: "pt-BR";
  scenes: NarrationSceneScript[];
  totalCharacters: number;
  // eleven_multilingual_v2: 1 character = 1 credit (confirmado ao vivo no
  // CANARY de voz, 2026-08-08/09) - nunca convertido pra BRL aqui (taxa
  // credito->BRL desta conta nao e conhecida).
  estimatedCredits: number;
  status: NarrationPlanStatus;
};

export type NarrationQualityStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";

export type NarrationQualityResult = {
  status: NarrationQualityStatus;
  reasons: string[];
};

// --- Dados de entrada (SOMENTE fontes ja calculadas - nunca recalculadas aqui) ---

export type NarrationOfferData = {
  title: string;
  // null = dado realmente ausente na oferta - nunca inventado.
  rating: number | null;
  reviewsCount: number | null;
};

export type NarrationProductData = {
  // Ja extraidos pelo Product Intelligence - o builder AINDA assim roda
  // cada um pela claims-policy antes de usar (ver narration-claims-guard.ts),
  // nunca confia cegamente em texto persistido em outra fase.
  keyBenefits: string[];
};

export type NarrationSceneOptions = {
  // Unica forma de uma cena virar SILENT por escolha (nunca inferido
  // automaticamente pelo builder) - ver item 13 do enunciado.
  forceSilent?: boolean;
};
