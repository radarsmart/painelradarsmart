// Radar Creative AI - Generation Orchestrator / Adapter: WAN 2.5 T2V 1080p (Text-to-Video)
//
// Adapter ISOLADO para o CANARY de background do HYBRID_PRODUCT_COMPOSITE -
// nao reaproveita lib/ugc/freepik.ts (aquele textToVideo() aponta pro
// endpoint kling-v3-omni-std, que a auditoria de 2026-08-08 confirmou
// nao existir de verdade na Kling - ver freepik-kling-t2v = DISABLED em
// provider-capabilities.ts). Contrato de campos verificado direto na
// documentacao oficial atual (docs.magnific.com/api-reference/text-to-video/
// wan-2-5-t2v-1080p) em 2026-08-08, ANTES de escrever este arquivo.
//
// Host/header: a doc oficial atual deste endpoint usa api.magnific.com +
// header x-magnific-api-key (diferente do api.freepik.com + x-freepik-api-key
// usado pelos adapters Kling mais antigos deste projeto) - mesma chave
// (env FREEPIK_API_KEY), header conforme documentado pra este host.
//
// Polling: GET .../wan-2-5-t2v-1080p (sem sufixo) e o endpoint de LISTA
// de tasks, documentado explicitamente (docs.magnific.com/.../
// wan-2-5-t2v-1080p-tasks). O GET de uma task INDIVIDUAL por id nao tem
// pagina de doc dedicada - inferido pelo mesmo padrao generico ja
// documentado em outras categorias da API magnific ("Poll GET /{task-id}
// until status COMPLETED") e ja comprovado funcionando no adapter Kling
// deste projeto (freepik-kling-image-to-video.ts). Sera confirmado de
// verdade so quando um CANARY real rodar.

const ENDPOINT_BASE = "https://api.magnific.com/v1/ai/text-to-video/wan-2-5-t2v-1080p";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 60 * 5s = 300s, mesmo padrao ja usado nos adapters Kling deste projeto

// Limites documentados oficialmente (docs.magnific.com, 2026-08-08) -
// validados ANTES do submit, nunca truncados silenciosamente.
export const WAN_PROMPT_MAX_LENGTH = 800;
export const WAN_NEGATIVE_PROMPT_MAX_LENGTH = 500;
export const WAN_APPROVED_DURATIONS = ["5", "10"] as const;
export type WanApprovedDuration = (typeof WAN_APPROVED_DURATIONS)[number];

export type WanTextToVideoRequest = {
  prompt: string;
  negativePrompt?: string;
  duration: WanApprovedDuration;
  seed?: number;
};

export type WanTextToVideoPayload = {
  prompt: string;
  negative_prompt?: string;
  duration: string;
  seed?: number;
};

export type WanValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validacao PURA (sem rede) dos limites documentados oficialmente - nunca
 * deixa passar um prompt/negative_prompt acima do limite real da API, e
 * nunca aceita uma duracao fora do enum documentado ("5"/"10").
 */
export function validateWanTextToVideoRequest(request: WanTextToVideoRequest): WanValidationResult {
  if (!request.prompt || !request.prompt.trim()) {
    return { ok: false, reason: "prompt e obrigatorio para o WAN 2.5 T2V." };
  }
  if (request.prompt.length > WAN_PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      reason: `prompt excede o limite documentado de ${WAN_PROMPT_MAX_LENGTH} caracteres (recebido: ${request.prompt.length}).`,
    };
  }
  if (request.negativePrompt && request.negativePrompt.length > WAN_NEGATIVE_PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      reason: `negative_prompt excede o limite documentado de ${WAN_NEGATIVE_PROMPT_MAX_LENGTH} caracteres (recebido: ${request.negativePrompt.length}).`,
    };
  }
  if (!(WAN_APPROVED_DURATIONS as readonly string[]).includes(request.duration)) {
    return {
      ok: false,
      reason: `duration "${request.duration}" nao e suportada - so ${WAN_APPROVED_DURATIONS.join(" ou ")} sao documentadas.`,
    };
  }
  return { ok: true };
}

/**
 * Monta o payload EXATO que seria enviado, sem chamar rede - usado tanto
 * pelo dry-run/preview quanto internamente por executeWanTextToVideo().
 */
export function buildWanTextToVideoPayload(request: WanTextToVideoRequest): WanTextToVideoPayload {
  return {
    prompt: request.prompt,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
    duration: request.duration,
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
  };
}

export function describeWanTextToVideoRequest(request: WanTextToVideoRequest): {
  endpoint: string;
  model: string;
  payload: WanTextToVideoPayload;
} {
  return {
    endpoint: ENDPOINT_BASE,
    model: "wan-2-5-t2v-1080p",
    payload: buildWanTextToVideoPayload(request),
  };
}

export type WanTextToVideoAdapterResult = {
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submete a tarefa + poll controlado - MESMO padrao ja usado no adapter
 * Kling deste projeto (intervalo fixo, numero maximo de tentativas,
 * timeout total, tratamento explicito de FAILED, nunca reenvia a mesma
 * tarefa, nunca cai pra outro provider). Validacao dos limites
 * documentados roda ANTES do submit - ver validateWanTextToVideoRequest.
 * Nunca recebe nem envia nenhuma referencia de produto - o payload nem
 * tem campo pra isso (text-to-video puro).
 */
export async function executeWanTextToVideo(request: WanTextToVideoRequest): Promise<WanTextToVideoAdapterResult> {
  const validation = validateWanTextToVideoRequest(request);
  if (!validation.ok) {
    return { status: "error", taskId: null, outputUrl: null, error: validation.reason };
  }

  const apiKey = getApiKey();
  const payload = buildWanTextToVideoPayload(request);

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
      error: `WAN 2.5 T2V falhou ao submeter (${submitResponse.status}): ${errText.slice(0, 500)}`,
    };
  }

  const submitData = (await submitResponse.json()) as { data?: { task_id?: string } };
  const taskId = submitData?.data?.task_id;
  if (!taskId) {
    return {
      status: "error",
      taskId: null,
      outputUrl: null,
      error: `task_id nao retornado pelo WAN: ${JSON.stringify(submitData)}`,
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
        error: `WAN 2.5 T2V falhou ao consultar status (${pollResponse.status}): ${errText.slice(0, 500)}`,
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
          error: `WAN concluiu mas nao retornou URL de video: ${JSON.stringify(pollData)}`,
        };
      }
      return { status: "success", taskId, outputUrl, error: null };
    }

    if (status === "FAILED") {
      return {
        status: "error",
        taskId,
        outputUrl: null,
        error: `Geracao falhou no WAN (status=FAILED): ${JSON.stringify(pollData)}`,
      };
    }

    // IN_PROGRESS/CREATED/outro status intermediario - continua o polling.
  }

  return {
    status: "error",
    taskId,
    outputUrl: null,
    error: `Timeout: WAN nao completou em ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (taskId=${taskId}).`,
  };
}
