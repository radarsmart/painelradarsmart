// Radar Creative AI - Generation Orchestrator / Adapter: Freepik OmniHuman 1.5 (CHARACTER_VIDEO)
//
// Adapter ISOLADO para o CANARY de CHARACTER_VIDEO - nao reaproveita
// lib/ugc/freepik.ts#animateAvatar (usado por outro fluxo em producao).
// Contrato de campos verificado direto na documentacao oficial ATUAL
// (docs.magnific.com/api-reference/video/omni-human-1-5, consultada em
// 2026-08-09) ANTES de escrever este arquivo - achado importante:
//
// lib/ugc/freepik.ts#animateAvatar usa host "api.freepik.com" e header
// "x-freepik-api-key" - AMBOS DESATUALIZADOS. A documentacao oficial
// atual usa host "api.magnific.com" e header "x-magnific-api-key" (mesmo
// rebranding ja confirmado nos adapters Kling/WAN deste projeto). Os
// nomes de campo do payload (image_url, audio_url, prompt, resolution)
// continuam corretos na funcao antiga - so host/header estao errados.
// Nao alteramos lib/ugc/freepik.ts nesta tarefa (fora de escopo, usada em
// outro lugar) - este adapter usa os valores corretos e atuais.
//
// Campos confirmados no schema (2026-08-09): image_url (string URI,
// obrigatorio, deve conter figura humana visivel, jpg/jpeg/png/webp),
// audio_url (string URI, OBRIGATORIO - OmniHuman e audio-driven, nunca
// gera sem audio de entrada), prompt (opcional, max 2000 chars, guia
// movimento/expressao/estilo), resolution ("720p"|"1080p", default
// 1080p), turbo_mode (boolean opcional, default false), webhook_url
// (opcional). SEM negative_prompt (a API nao tem esse campo - diferente
// do Kling). Limites de audio documentados: MP3/OGG/WAV/M4A/AAC,
// duracao maxima 60s em 720p ou 30s em 1080p.

import { randomUUID } from "node:crypto";

const ENDPOINT_BASE = "https://api.magnific.com/v1/ai/video/omni-human-1-5";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 60 * 5s = 300s, mesmo padrao ja usado nos outros adapters deste projeto

export const OMNIHUMAN_PROMPT_MAX_LENGTH = 2000;
export const OMNIHUMAN_APPROVED_RESOLUTIONS = ["720p", "1080p"] as const;
export type OmniHumanApprovedResolution = (typeof OMNIHUMAN_APPROVED_RESOLUTIONS)[number];

// Limites de duracao de audio documentados oficialmente - dependem da
// resolucao escolhida (1080p tem janela mais curta que 720p).
export const OMNIHUMAN_MAX_AUDIO_SECONDS: Record<OmniHumanApprovedResolution, number> = {
  "720p": 60,
  "1080p": 30,
};

export type OmniHumanRequest = {
  imageUrl: string;
  audioUrl: string;
  prompt?: string;
  resolution: OmniHumanApprovedResolution;
  turboMode?: boolean;
};

export type OmniHumanPayload = {
  image_url: string;
  audio_url: string;
  prompt?: string;
  resolution: OmniHumanApprovedResolution;
  turbo_mode?: boolean;
};

export type OmniHumanAdapterResult = {
  status: "success" | "error";
  taskId: string | null;
  outputUrl: string | null;
  error: string | null;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function getApiKey(): string {
  const apiKey = toText(process.env.FREEPIK_API_KEY);
  if (!apiKey) throw new Error("FREEPIK_API_KEY nao configurada.");
  return apiKey;
}

/**
 * Monta o payload EXATO que seria enviado, sem chamar rede - usado tanto
 * pelo preview/PRE-FLIGHT quanto internamente por executeOmniHumanCharacterVideo().
 */
export function buildOmniHumanPayload(request: OmniHumanRequest): OmniHumanPayload {
  const payload: OmniHumanPayload = {
    image_url: request.imageUrl,
    audio_url: request.audioUrl,
    resolution: request.resolution,
  };
  if (request.prompt) payload.prompt = request.prompt;
  if (request.turboMode !== undefined) payload.turbo_mode = request.turboMode;
  return payload;
}

export function describeOmniHumanRequest(request: OmniHumanRequest): {
  endpoint: string;
  model: string;
  payload: OmniHumanPayload;
} {
  return {
    endpoint: ENDPOINT_BASE,
    model: "omni-human-1-5",
    payload: buildOmniHumanPayload(request),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submete a tarefa + poll controlado (mesmo padrao ja usado nos adapters
 * Kling/WAN deste projeto: intervalo fixo, numero maximo de tentativas,
 * timeout total, tratamento explicito de FAILED). Nunca reenvia a mesma
 * tarefa, nunca cai para outro provider. NAO EXECUTADO nesta tarefa -
 * so escrito e testado com fetch injetado/mockado.
 */
export async function executeOmniHumanCharacterVideo(request: OmniHumanRequest): Promise<OmniHumanAdapterResult> {
  const apiKey = getApiKey();
  const payload = buildOmniHumanPayload(request);

  const submitResponse = await fetch(ENDPOINT_BASE, {
    method: "POST",
    headers: {
      "x-magnific-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitResponse.ok) {
    const errText = await submitResponse.text().catch(() => "");
    return {
      status: "error",
      taskId: null,
      outputUrl: null,
      error: `Freepik OmniHuman falhou ao submeter (${submitResponse.status}): ${errText.slice(0, 500)}`,
    };
  }

  const submitData = (await submitResponse.json()) as { data?: { task_id?: string } };
  const taskId = submitData?.data?.task_id ?? randomUUID();
  if (!submitData?.data?.task_id) {
    return {
      status: "error",
      taskId: null,
      outputUrl: null,
      error: `task_id nao retornado pelo OmniHuman: ${JSON.stringify(submitData)}`,
    };
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${ENDPOINT_BASE}/${taskId}`, {
      headers: { "x-magnific-api-key": apiKey },
    });

    if (!pollResponse.ok) {
      const errText = await pollResponse.text().catch(() => "");
      return {
        status: "error",
        taskId,
        outputUrl: null,
        error: `Freepik OmniHuman falhou ao consultar status (${pollResponse.status}): ${errText.slice(0, 500)}`,
      };
    }

    const pollData = (await pollResponse.json()) as { data?: { status?: string; generated?: string[] } };
    const status = pollData?.data?.status;

    if (status === "COMPLETED") {
      const outputUrl = pollData?.data?.generated?.[0] ?? null;
      if (!outputUrl) {
        return {
          status: "error",
          taskId,
          outputUrl: null,
          error: `OmniHuman concluiu mas nao retornou URL de video: ${JSON.stringify(pollData)}`,
        };
      }
      return { status: "success", taskId, outputUrl, error: null };
    }

    if (status === "FAILED") {
      return {
        status: "error",
        taskId,
        outputUrl: null,
        error: `Geracao falhou no OmniHuman (status=FAILED): ${JSON.stringify(pollData)}`,
      };
    }

    // CREATED/IN_PROGRESS - continua o polling.
  }

  return {
    status: "error",
    taskId,
    outputUrl: null,
    error: `Timeout: OmniHuman nao completou em ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (taskId=${taskId}).`,
  };
}
