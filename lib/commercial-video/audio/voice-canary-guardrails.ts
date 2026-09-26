// Radar Creative AI - Audio Pipeline / Voice Canary Guardrails
//
// Regras do CANARY de TTS real (ElevenLabs) - existe SO pra validar UMA
// geracao real controlada antes de qualquer integracao automatica ao
// Audio Timeline. Mesmo padrao ja usado no CANARY de video
// (lib/generation-orchestrator/video-canary-guardrails.ts): provider
// aprovado fixo, confirmacao explicita, sem fallback, sem retry.

import fs from "node:fs";
import path from "node:path";

import { generateElevenLabsAudio } from "@/lib/ugc/audio";

// Unico provider aprovado para este primeiro canary de voz - ver
// relatorio de auditoria (lib/ugc/audio.ts ja tem uma integracao real e
// valida com ElevenLabs; nenhum outro provider de TTS foi auditado).
export const APPROVED_VOICE_CANARY_PROVIDER = "elevenlabs";
export const APPROVED_VOICE_CANARY_MODEL_ID = "eleven_multilingual_v2";

// Confirmado ao vivo (docs.elevenlabs.io, 2026-08-08): no modelo
// eleven_multilingual_v2, 1 caractere de texto = 1 credito. Nao ha taxa
// fixa credito->BRL publicada (varia por plano) - nunca inventada aqui.
export const VOICE_CANARY_CREDITS_PER_CHARACTER = 1;

// Guardrail de escopo: um CANARY de voz e "uma frase curta", nunca um
// roteiro inteiro - protege contra enviar acidentalmente um script longo
// (e caro) por engano nesse fluxo de teste isolado.
export const VOICE_CANARY_MAX_TEXT_LENGTH = 200;

export type VoiceCanaryRequestInput = {
  provider: string;
  voiceId: string;
  text: string;
  confirmed: boolean;
};

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

// So o literal exato "CANARY" e valido para este fluxo - mesma regra do
// canary de video (ver isValidVideoCanaryMode).
export function isValidVoiceCanaryMode(mode: string): boolean {
  return mode === "CANARY";
}

export function estimateVoiceCanaryCredits(text: string): number {
  return text.length * VOICE_CANARY_CREDITS_PER_CHARACTER;
}

/**
 * `text` e tipado como `string` (nunca `string[]`) - "exactlyOneText" e
 * garantido estruturalmente pelo proprio tipo, nao por uma checagem de
 * tamanho de array. A validacao aqui cobre os outros guardrails:
 * confirmacao, provider aprovado (sem fallback), voiceId obrigatorio
 * (nunca escolhido automaticamente) e tamanho maximo do texto.
 */
export function validateVoiceCanaryRequest(input: VoiceCanaryRequestInput): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY de voz exige confirmacao explicita (confirmed=true)." };
  }

  if (input.provider !== APPROVED_VOICE_CANARY_PROVIDER) {
    return {
      ok: false,
      reason: `Provider "${input.provider}" nao e o provider aprovado para este CANARY de voz (${APPROVED_VOICE_CANARY_PROVIDER}) - sem fallback para outro provider pago.`,
    };
  }

  if (typeof input.voiceId !== "string" || input.voiceId.trim().length === 0) {
    return { ok: false, reason: "voiceId e obrigatorio - nunca escolhido automaticamente pelo sistema." };
  }

  if (typeof input.text !== "string") {
    return { ok: false, reason: "text deve ser uma unica string (exactlyOneText)." };
  }

  const trimmed = input.text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "text vazio." };
  }

  if (trimmed.length > VOICE_CANARY_MAX_TEXT_LENGTH) {
    return {
      ok: false,
      reason: `CANARY de voz aceita so uma frase curta (ate ${VOICE_CANARY_MAX_TEXT_LENGTH} caracteres) - recebido ${trimmed.length}.`,
    };
  }

  return { ok: true };
}

export type VoiceCanaryStatus = "COMPLETED" | "FAILED";

export type VoiceCanaryResult = {
  provider: string;
  model: string;
  voiceId: string;
  text: string;
  outputPath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  estimatedCredits: number;
  status: VoiceCanaryStatus;
  startedAt: string;
  completedAt: string;
  error: string | null;
};

/**
 * UMA UNICA chamada real, sem retry, sem fallback. Falhou -> status
 * FAILED com o erro exato do provider, nunca tenta de novo
 * automaticamente.
 */
export async function executeVoiceCanary(input: VoiceCanaryRequestInput, outputPath: string): Promise<VoiceCanaryResult> {
  const startedAt = new Date().toISOString();
  const estimatedCredits = estimateVoiceCanaryCredits(input.text);

  const validation = validateVoiceCanaryRequest(input);
  if (!validation.ok) {
    return {
      provider: input.provider,
      model: APPROVED_VOICE_CANARY_MODEL_ID,
      voiceId: input.voiceId,
      text: input.text,
      outputPath: null,
      mimeType: null,
      byteSize: null,
      estimatedCredits,
      status: "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: validation.reason,
    };
  }

  try {
    const audio = await generateElevenLabsAudio({ text: input.text, voiceId: input.voiceId });

    if (audio.buffer.byteLength === 0) {
      return {
        provider: input.provider,
        model: APPROVED_VOICE_CANARY_MODEL_ID,
        voiceId: input.voiceId,
        text: input.text,
        outputPath: null,
        mimeType: audio.mimeType,
        byteSize: 0,
        estimatedCredits,
        status: "FAILED",
        startedAt,
        completedAt: new Date().toISOString(),
        error: "Provider retornou audio vazio (0 bytes).",
      };
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, audio.buffer);

    return {
      provider: input.provider,
      model: APPROVED_VOICE_CANARY_MODEL_ID,
      voiceId: input.voiceId,
      text: input.text,
      outputPath,
      mimeType: audio.mimeType,
      byteSize: audio.buffer.byteLength,
      estimatedCredits,
      status: "COMPLETED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      provider: input.provider,
      model: APPROVED_VOICE_CANARY_MODEL_ID,
      voiceId: input.voiceId,
      text: input.text,
      outputPath: null,
      mimeType: null,
      byteSize: null,
      estimatedCredits,
      status: "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Erro desconhecido no CANARY de voz.",
    };
  }
}
