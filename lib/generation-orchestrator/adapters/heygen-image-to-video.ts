// Radar Creative AI - Generation Orchestrator / Adapter: HeyGen Image-to-Video (CHARACTER_VIDEO)
//
// Adapter ISOLADO para o CANARY de CHARACTER_VIDEO via HeyGen - nao
// reaproveita lib/ugc/heygen.ts (aquele so usa avatar_id de biblioteca,
// nunca uma imagem customizada da Garota Radar - ver
// provider-capabilities.ts). Contrato verificado direto na documentacao
// oficial atual (developers.heygen.com/image-to-video-1 e
// developers.heygen.com/reference/create-video, consultadas em
// 2026-08-09) ANTES de escrever este arquivo.
//
// Campos confirmados: type="image" (mutuamente exclusivo com type="avatar"),
// image = {type:"url", url} OU {type:"asset_id", asset_id} (usamos SEMPRE
// url - a Garota Radar ja tem URL publica no nosso Storage, nunca
// precisamos de upload), audio_url (string, mutuamente exclusivo com
// script+voice_id), resolution ("4k"|"1080p"|"720p"), aspect_ratio
// ("auto"|"16:9"|"9:16"|"4:5"|"5:4"|"1:1"). SEM negative_prompt, SEM
// motion_prompt neste modo (confirmado - motion_prompt so existe pra
// avatares de biblioteca/photo avatar treinado, nao pra type="image").
//
// Custo confirmado (help.heygen.com/en/articles/10060327, 2026-08-09):
// billing por WALLET em USD, "$4 por 1 minuto de output 1080p" pro engine
// Avatar IV (o motor por tras do modo image, pela nossa leitura da
// documentacao - nao ha um campo "engine" exposto no schema de type="image"
// pra confirmar isso byte a byte, documentado como inferencia razoavel,
// nunca como certeza absoluta).

const ENDPOINT_BASE = "https://api.heygen.com/v3/videos";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 60 * 5s = 300s, mesmo padrao ja usado nos outros adapters deste projeto

export const HEYGEN_APPROVED_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type HeyGenApprovedResolution = (typeof HEYGEN_APPROVED_RESOLUTIONS)[number];

export const HEYGEN_APPROVED_ASPECT_RATIOS = ["auto", "16:9", "9:16", "4:5", "5:4", "1:1"] as const;
export type HeyGenApprovedAspectRatio = (typeof HEYGEN_APPROVED_ASPECT_RATIOS)[number];

export type HeyGenImageToVideoRequest = {
  imageUrl: string;
  audioUrl: string;
  resolution: HeyGenApprovedResolution;
  aspectRatio: HeyGenApprovedAspectRatio;
};

export type HeyGenImageToVideoPayload = {
  type: "image";
  image: { type: "url"; url: string };
  audio_url: string;
  resolution: HeyGenApprovedResolution;
  aspect_ratio: HeyGenApprovedAspectRatio;
};

export type HeyGenAdapterResult = {
  status: "success" | "error";
  videoId: string | null;
  outputUrl: string | null;
  error: string | null;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function getApiKey(): string {
  const apiKey = toText(process.env.HEYGEN_API_KEY);
  if (!apiKey) throw new Error("HEYGEN_API_KEY nao configurada.");
  return apiKey;
}

/**
 * Monta o payload EXATO que seria enviado, sem chamar rede - usado tanto
 * pelo preview/PRE-FLIGHT quanto internamente por executeHeyGenImageToVideo().
 * type="image" e mutuamente exclusivo com type="avatar" - nunca mistura
 * os dois. audio_url e sempre usado (nunca script/voice_id) - preserva a
 * voz oficial da Garota Radar (Ana Dias/ElevenLabs), nunca a TTS nativa
 * do HeyGen.
 */
export function buildHeyGenImageToVideoPayload(request: HeyGenImageToVideoRequest): HeyGenImageToVideoPayload {
  return {
    type: "image",
    image: { type: "url", url: request.imageUrl },
    audio_url: request.audioUrl,
    resolution: request.resolution,
    aspect_ratio: request.aspectRatio,
  };
}

export function describeHeyGenImageToVideoRequest(request: HeyGenImageToVideoRequest): {
  endpoint: string;
  model: string;
  payload: HeyGenImageToVideoPayload;
} {
  return {
    endpoint: ENDPOINT_BASE,
    model: "heygen-image-to-video (avatar_iv, inferido)",
    payload: buildHeyGenImageToVideoPayload(request),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submete a tarefa + poll controlado (mesmo padrao ja usado nos outros
 * adapters deste projeto: intervalo fixo, numero maximo de tentativas,
 * timeout total, tratamento explicito de FAILED). Nunca reenvia a mesma
 * tarefa, nunca cai para outro provider. Trata QUALQUER status que nao
 * seja "completed"/"failed" como "ainda processando" - a enumeracao
 * completa de status intermediarios (pending/waiting/processing) nao foi
 * 100% confirmada byte a byte na documentacao atual, mas essa
 * abordagem defensiva ja e o padrao usado em todos os outros adapters
 * deste projeto (Kling/WAN/OmniHuman), entao nao bloqueia a implementacao.
 */
export async function executeHeyGenImageToVideo(request: HeyGenImageToVideoRequest): Promise<HeyGenAdapterResult> {
  const apiKey = getApiKey();
  const payload = buildHeyGenImageToVideoPayload(request);

  const submitResponse = await fetch(ENDPOINT_BASE, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitResponse.ok) {
    const errText = await submitResponse.text().catch(() => "");
    return {
      status: "error",
      videoId: null,
      outputUrl: null,
      error: `HeyGen falhou ao submeter (${submitResponse.status}): ${errText.slice(0, 500)}`,
    };
  }

  const submitData = (await submitResponse.json()) as { data?: { video_id?: string } };
  const videoId = submitData?.data?.video_id ?? null;
  if (!videoId) {
    return {
      status: "error",
      videoId: null,
      outputUrl: null,
      error: `video_id nao retornado pelo HeyGen: ${JSON.stringify(submitData)}`,
    };
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${ENDPOINT_BASE}/${videoId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!pollResponse.ok) {
      const errText = await pollResponse.text().catch(() => "");
      return {
        status: "error",
        videoId,
        outputUrl: null,
        error: `HeyGen falhou ao consultar status (${pollResponse.status}): ${errText.slice(0, 500)}`,
      };
    }

    const pollData = (await pollResponse.json()) as {
      data?: { status?: string; video_url?: string; failure_code?: string; failure_message?: string };
    };
    const status = pollData?.data?.status;

    if (status === "completed") {
      const outputUrl = pollData?.data?.video_url ?? null;
      if (!outputUrl) {
        return {
          status: "error",
          videoId,
          outputUrl: null,
          error: `HeyGen concluiu mas nao retornou video_url: ${JSON.stringify(pollData)}`,
        };
      }
      return { status: "success", videoId, outputUrl, error: null };
    }

    if (status === "failed") {
      return {
        status: "error",
        videoId,
        outputUrl: null,
        error: `Geracao falhou no HeyGen (status=failed): ${pollData?.data?.failure_message ?? JSON.stringify(pollData)}`,
      };
    }

    // pending/waiting/processing (ou qualquer outro nome intermediario) -
    // continua o polling.
  }

  return {
    status: "error",
    videoId,
    outputUrl: null,
    error: `Timeout: HeyGen nao completou em ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (videoId=${videoId}).`,
  };
}
