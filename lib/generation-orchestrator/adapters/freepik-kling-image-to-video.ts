// Radar Creative AI - Generation Orchestrator / Adapter: Freepik Kling 2.5 Pro (Image-to-Video)
//
// Adapter ISOLADO para o CANARY de video - nao reaproveita nem altera
// lib/ugc/freepik.ts (usado por outros fluxos em producao). Contrato de
// campos verificado direto na documentacao oficial atual (docs.magnific.com,
// para onde docs.freepik.com redireciona desde o rebranding de 2026-04-28)
// em 2026-08-08, ANTES de escrever este arquivo - achado importante:
//
// lib/ugc/freepik.ts:animateImage() envia "image_url" e "aspect_ratio",
// mas o schema atual do endpoint espera "image" (nao "image_url") e NAO
// tem campo aspect_ratio nenhum (a proporcao de saida e herdada da
// imagem de entrada). Este adapter usa os nomes corretos e atuais -
// NUNCA "image_url", NUNCA "aspect_ratio". Nao alteramos a funcao antiga
// nesta tarefa (fora de escopo, usada em outros lugares).
//
// Campos confirmados no schema: image (string, URL ou base64, max 10MB,
// min 300x300px, razao 1:2.5 a 2.5:1), duration ("5"|"10"), prompt
// (opcional, max 2500 chars), negative_prompt (opcional, max 2500 chars -
// SUPORTADO DE VERDADE aqui, diferente do /v1/images/edits da OpenAI),
// cfg_scale (0-1, default 0.5). Sem parametro de audio, sem controle de
// camera dedicado (movimento de camera so via texto no prompt).

import { randomUUID } from "node:crypto";

const ENDPOINT_BASE = "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 60 * 5s = 300s de timeout total, mesmo padrao ja usado em lib/ugc/freepik.ts para este mesmo endpoint

export type FreepikKlingRequest = {
  inputImageUrl: string;
  prompt: string;
  negativePrompt: string;
  duration: string;
  cfgScale: number;
};

export type FreepikKlingPayload = {
  image: string;
  prompt: string;
  negative_prompt: string;
  duration: string;
  cfg_scale: number;
};

export type FreepikKlingAdapterResult = {
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
 * pelo dry-run/preview quanto internamente por execute().
 */
export function buildFreepikKlingPayload(request: FreepikKlingRequest): FreepikKlingPayload {
  return {
    image: request.inputImageUrl,
    prompt: request.prompt,
    negative_prompt: request.negativePrompt,
    duration: request.duration,
    cfg_scale: request.cfgScale,
  };
}

export function describeFreepikKlingRequest(request: FreepikKlingRequest): {
  endpoint: string;
  model: string;
  payload: FreepikKlingPayload;
} {
  return {
    endpoint: ENDPOINT_BASE,
    model: "kling-v2-5-pro",
    payload: buildFreepikKlingPayload(request),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submete a tarefa + poll controlado (intervalo fixo, numero maximo de
 * tentativas, timeout total, tratamento explicito de FAILED). O polling
 * consulta a MESMA taskId repetidamente - nunca dispara uma nova geracao.
 * Se o provider falhar (FAILED) ou estourar timeout, retorna erro
 * imediatamente - nunca tenta de novo automaticamente, nunca cai para
 * outro provider.
 */
export async function executeFreepikKlingImageToVideo(
  request: FreepikKlingRequest,
): Promise<FreepikKlingAdapterResult> {
  const apiKey = getApiKey();
  const payload = buildFreepikKlingPayload(request);

  const submitResponse = await fetch(ENDPOINT_BASE, {
    method: "POST",
    headers: {
      "x-freepik-api-key": apiKey,
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
      error: `Freepik Kling image-to-video falhou ao submeter (${submitResponse.status}): ${errText.slice(0, 500)}`,
    };
  }

  const submitData = (await submitResponse.json()) as { data?: { task_id?: string } };
  const taskId = submitData?.data?.task_id ?? randomUUID();
  if (!submitData?.data?.task_id) {
    return {
      status: "error",
      taskId: null,
      outputUrl: null,
      error: `task_id nao retornado pelo Kling: ${JSON.stringify(submitData)}`,
    };
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${ENDPOINT_BASE}/${taskId}`, {
      headers: { "x-freepik-api-key": apiKey },
    });

    if (!pollResponse.ok) {
      const errText = await pollResponse.text().catch(() => "");
      return {
        status: "error",
        taskId,
        outputUrl: null,
        error: `Freepik Kling falhou ao consultar status (${pollResponse.status}): ${errText.slice(0, 500)}`,
      };
    }

    const pollData = (await pollResponse.json()) as {
      data?: { status?: string; generated?: Array<string | { url?: string }>; url?: string; video_url?: string };
    };
    const status = pollData?.data?.status;

    if (status === "COMPLETED" || status === "DONE") {
      let outputUrl = pollData?.data?.url ?? pollData?.data?.video_url ?? null;
      if (!outputUrl && Array.isArray(pollData?.data?.generated)) {
        const first = pollData.data.generated[0];
        outputUrl = typeof first === "string" ? first : (first?.url ?? null);
      }
      if (!outputUrl) {
        return {
          status: "error",
          taskId,
          outputUrl: null,
          error: `Kling concluiu mas nao retornou URL de video: ${JSON.stringify(pollData)}`,
        };
      }
      return { status: "success", taskId, outputUrl, error: null };
    }

    if (status === "FAILED") {
      return {
        status: "error",
        taskId,
        outputUrl: null,
        error: `Geracao falhou no Kling (status=FAILED): ${JSON.stringify(pollData)}`,
      };
    }

    // IN_PROGRESS/CREATED/outro status intermediario - continua o polling.
  }

  return {
    status: "error",
    taskId,
    outputUrl: null,
    error: `Timeout: Kling nao completou em ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (taskId=${taskId}).`,
  };
}
