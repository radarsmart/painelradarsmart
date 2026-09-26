// Radar Creative AI - Audio Pipeline / Garota Radar Voice Profile
//
// Componente de VOZ da identidade da Garota Radar - equivalente sonoro do
// que lib/brand-character/garota-radar.ts ja faz pro componente visual
// (persona em ugc_personas). Deliberadamente NAO persistido em banco
// nesta fase (nenhuma migration foi pedida/autorizada) - e uma constante
// de codigo, no mesmo padrao ja usado para outras decisoes de CANARY
// aprovadas neste projeto (ex: APPROVED_VIDEO_CANARY_PROVIDER em
// lib/generation-orchestrator/video-canary-guardrails.ts).
//
// Historico da aprovacao:
// - CANARY #1 (Ana Alice - Friendly & Clear, ORgG8rwdAiMYRug8RJwR):
//   REJEITADA em avaliacao humana apos audicao real.
// - CANARY #2 (Ana Dias - Engaging, Smooth and Forceful,
//   MZxV5lN3cv7hi1376O0m): APROVADA em avaliacao humana apos audicao real
//   (2026-08-09) - unica voz oficial da Garota Radar ate uma nova decisao
//   humana substituir esta constante.

import path from "node:path";

import { ElevenLabsNarrationProvider } from "@/lib/commercial-video/audio/elevenlabs-narration-provider";

export type GarotaRadarVoiceProfile = {
  provider: "elevenlabs";
  voiceId: string;
  voiceName: string;
  model: string;
  approvedAt: string;
  approvedFor: string;
  canaryReference: {
    text: string;
    outputFile: string;
    creditsUsed: number;
  };
  notes: string;
};

export const GAROTA_RADAR_VOICE_PROFILE: GarotaRadarVoiceProfile = {
  provider: "elevenlabs",
  voiceId: "MZxV5lN3cv7hi1376O0m",
  voiceName: "Ana Dias - Engaging, Smooth and Forceful",
  model: "eleven_multilingual_v2",
  approvedAt: "2026-08-09",
  approvedFor: "Narracao comercial da Garota Radar (hooks/CTAs curtos de video, ate ~3s por segmento)",
  canaryReference: {
    text: "Encontrei uma oferta que vale a pena conferir.",
    outputFile: "garota-radar-voice-canary-02.mp3",
    creditsUsed: 46,
  },
  notes:
    "Aprovada por avaliacao humana (audicao direta) apos comparacao A/B com o CANARY #1 " +
    "(Ana Alice, rejeitada). Nenhum parametro de voice_settings customizado foi validado ainda - " +
    "usa os defaults calculados por buildElevenLabsVoiceSettings() em lib/ugc/audio.ts. " +
    "Ainda NAO integrada ao Commercial Video Pipeline (ver ElevenLabsNarrationProvider) - " +
    "essa e uma decisao separada, futura.",
};

/**
 * Fabrica um NarrationProvider ja configurado com a voz oficial aprovada -
 * nunca escolhe voiceId por conta propria, so materializa a constante
 * acima. Ainda nao usado por nenhum fluxo de comercial real.
 */
export function createGarotaRadarNarrationProvider(outputDir: string): ElevenLabsNarrationProvider {
  return new ElevenLabsNarrationProvider(GAROTA_RADAR_VOICE_PROFILE.voiceId, outputDir);
}

export function resolveDefaultGarotaRadarNarrationOutputDir(): string {
  return path.join(process.cwd(), "temp", "garota-radar-narration");
}
