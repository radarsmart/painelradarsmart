// Radar Creative AI - Commercial Director / Audio Direction
//
// Somente DIRECAO (texto descritivo) - nao gera audio nenhum nesta fase.

import type { AudioDirection, CommercialPace, VisualStyle } from "@/lib/commercial-director/types";

export function buildAudioDirection(pace: CommercialPace, visualStyle: VisualStyle): AudioDirection {
  const base: AudioDirection =
    pace === "FAST"
      ? { musicMood: "MODERN_ENERGETIC", musicEnergy: "HIGH", voiceStyle: "PERSUASIVE_FRIENDLY", sfxStyle: "PRODUCT_SYNC" }
      : pace === "CINEMATIC"
        ? { musicMood: "CINEMATIC_EMOTIONAL", musicEnergy: "LOW", voiceStyle: "CALM_CONFIDENT", sfxStyle: null }
        : { musicMood: "UPBEAT_FRIENDLY", musicEnergy: "MEDIUM", voiceStyle: "PERSUASIVE_FRIENDLY", sfxStyle: "PRODUCT_SYNC" };

  if (visualStyle === "LUXURY") {
    return { ...base, voiceStyle: "CALM_CONFIDENT", sfxStyle: null };
  }
  if (visualStyle === "UGC_NATIVE") {
    return { ...base, voiceStyle: "CASUAL_AUTHENTIC" };
  }

  return base;
}
