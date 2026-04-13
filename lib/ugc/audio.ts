import type { UGCBehaviorDirection, UGCVoiceDirection } from "./types";

type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildElevenLabsVoiceSettings(params: {
  voiceDirection?: UGCVoiceDirection;
  behaviorDirection?: UGCBehaviorDirection;
}): ElevenLabsVoiceSettings {
  const voiceDirection = params.voiceDirection ?? {};
  const behaviorDirection = params.behaviorDirection ?? {};

  const stabilityBase =
    behaviorDirection.imperfectionLevel === "high"
      ? 0.36
      : behaviorDirection.imperfectionLevel === "low"
        ? 0.62
        : 0.5;

  const similarityBase =
    voiceDirection.credibility === "low"
      ? 0.72
      : voiceDirection.credibility === "medium"
        ? 0.82
        : 0.9;

  const styleBase =
    voiceDirection.emotionalIntensity === "high"
      ? 0.68
      : voiceDirection.emotionalIntensity === "low"
        ? 0.12
        : 0.35;

  const paceAdjustment =
    voiceDirection.pace === "fast" ? -0.05 : voiceDirection.pace === "calm" ? 0.05 : 0;

  const pauseAdjustment =
    voiceDirection.pauseStyle === "fragmented"
      ? -0.08
      : voiceDirection.pauseStyle === "clean"
        ? 0.06
        : 0;

  return {
    stability: clamp(stabilityBase + paceAdjustment + pauseAdjustment, 0.2, 0.85),
    similarity_boost: clamp(similarityBase, 0.55, 0.95),
    style: clamp(styleBase, 0, 0.95),
    use_speaker_boost: voiceDirection.credibility !== "low",
  };
}

function sanitizeTextForTts(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

export async function generateElevenLabsAudio(params: {
  text: string;
  voiceId: string;
  voiceDirection?: UGCVoiceDirection;
  behaviorDirection?: UGCBehaviorDirection;
}): Promise<{ buffer: Buffer; mimeType: string; settings: ElevenLabsVoiceSettings }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY não configurada no ambiente.");
  }

  const text = sanitizeTextForTts(params.text);
  if (!text) {
    throw new Error("Texto vazio para geração de áudio.");
  }

  const settings = buildElevenLabsVoiceSettings({
    voiceDirection: params.voiceDirection,
    behaviorDirection: params.behaviorDirection,
  });

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: settings,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs error: ${response.status} ${errorText}`.trim());
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: "audio/mpeg",
    settings,
  };
}
