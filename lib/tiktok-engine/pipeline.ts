import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";
import { getModelById } from "@/lib/tiktok-engine/models";
import type {
  BriefingStatus,
  JobStatus,
  ScriptPayload,
  TikTokGenerateRequest,
} from "@/lib/tiktok-engine/types";

const AUDIO_BUCKET = "tiktok-engine-assets";
const OPENAI_MODEL = "gpt-4o";
const HEYGEN_POLL_ATTEMPTS = 24;
const HEYGEN_POLL_INTERVAL_MS = 5000;

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel ${name} ausente.`);
  return value;
}

function parsePrice(value: string | null | undefined): number {
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

async function updateBriefingStatus(briefingId: string, status: BriefingStatus) {
  await supabaseAdmin
    .from("tiktok_engine_briefings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", briefingId);
}

async function updateJob(
  jobId: string,
  status: JobStatus,
  patch: Record<string, unknown> = {},
) {
  await supabaseAdmin
    .from("tiktok_engine_jobs")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...(status === "processing" ? { started_at: new Date().toISOString() } : {}),
      ...(status === "completed" || status === "failed"
        ? { completed_at: new Date().toISOString() }
        : {}),
      ...patch,
    })
    .eq("id", jobId);
}

function buildScriptPrompts(input: TikTokGenerateRequest, modelId: number) {
  const model = getModelById(modelId);
  if (!model) throw new Error(`Modelo ${modelId} não encontrado.`);

  const system = [
    "Você é roteirista sênior de TikTok Shop com foco em conversão.",
    "Responda APENAS JSON válido sem markdown.",
    "Escreva em português brasileiro.",
    "Tom humano, direto, sem parecer institucional.",
    "CTA deve direcionar para Radar Smart sem citar marketplace no CTA final.",
  ].join(" ");

  const user = `PRODUTO: ${input.product_name}
PREÇO: R$ ${input.product_price}
DESCONTO: ${input.product_discount ?? "não informado"}
CATEGORIA: ${input.product_category ?? "não informada"}
BENEFÍCIOS: ${input.product_benefits}
DOR: ${input.product_pain}
CONCORRENTE: ${input.competitor_name ?? "não informado"} (${input.competitor_price ?? "n/a"})
URL: ${input.shop_url ?? "não informado"}
MODELO: ${model.name}
ÂNGULO: ${model.promptAngle}
DURAÇÃO ALVO: ${model.duration}

Retorne no formato:
{
  "model_id": ${model.id},
  "model_name": "${model.name}",
  "title": "título curto",
  "duration_seconds": 24,
  "script_audio": "texto da fala com pausas naturais...",
  "visual_directions": [{"timestamp":"0-3s","direction":"..."}],
  "text_overlays": [{"timestamp":"0-3s","text":"...","position":"top","style":"bold"}],
  "hashtags": ["#radarsmart", "#achados"],
  "caption": "legenda pronta"
}`;

  return { system, user, model };
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

async function generateScriptWithOpenAI(
  input: TikTokGenerateRequest,
  modelId: number,
): Promise<ScriptPayload> {
  const openAiKey = requiredEnv("OPENAI_API_KEY");
  const { system, user } = buildScriptPrompts(input, modelId);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  const payload = (await res.json()) as OpenAIChatCompletionResponse;
  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw new Error("OpenAI retornou resposta vazia para script.");
  }
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as ScriptPayload;
}

async function generateAudioWithElevenLabs(
  script: ScriptPayload,
  voiceId: string,
): Promise<Buffer> {
  const elevenApiKey = requiredEnv("ELEVENLABS_API_KEY");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": elevenApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: script.script_audio,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.5,
        speed: 1.12,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function uploadAudioToStorage(briefingId: string, jobId: string, audio: Buffer) {
  const path = `briefings/${briefingId}/audio/${jobId}-${randomUUID()}.mp3`;
  const upload = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (upload.error) throw new Error(`Storage upload falhou: ${upload.error.message}`);
  const publicData = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return { audioPath: path, audioUrl: publicData.data.publicUrl };
}

async function createHeygenVideo(
  avatarId: string,
  audioUrl: string,
  title: string,
): Promise<string> {
  const heygenApiKey = requiredEnv("HEYGEN_API_KEY");
  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: {
      "X-Api-Key": heygenApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "audio", audio_url: audioUrl },
          background: { type: "color", value: "#FFFFFF" },
        },
      ],
      caption: true,
      dimension: { width: 1080, height: 1920 },
      title,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { video_id?: string };
    error?: string;
  };
  const videoId = body?.data?.video_id;
  if (!res.ok || !videoId) {
    throw new Error(`HeyGen falhou (${res.status}): ${body.error ?? "sem video_id"}`);
  }
  return videoId;
}

async function pollHeygenVideo(videoId: string): Promise<string> {
  const heygenApiKey = requiredEnv("HEYGEN_API_KEY");
  for (let i = 0; i < HEYGEN_POLL_ATTEMPTS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, HEYGEN_POLL_INTERVAL_MS));
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      {
        headers: { Accept: "application/json", "X-Api-Key": heygenApiKey },
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; video_url?: string };
    };
    const status = body?.data?.status;
    if (status === "completed" && body?.data?.video_url) {
      return body.data.video_url;
    }
    if (status === "failed") {
      throw new Error("HeyGen retornou status failed.");
    }
  }
  throw new Error("Timeout aguardando renderização do HeyGen.");
}

async function sendWebhook(url: string, payload: unknown) {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

type JobRow = {
  id: string;
  briefing_id: string;
  model_id: number;
  model_name: string;
};

async function getRegisteredDefaultVoiceId(): Promise<string | null> {
  const query = await supabaseAdmin
    .from("tiktok_engine_config")
    .select("config_value")
    .eq("config_key", "voice_registry")
    .eq("is_active", true)
    .maybeSingle();

  if (query.error || !query.data?.config_value || typeof query.data.config_value !== "object") {
    return null;
  }

  const record = query.data.config_value as Record<string, unknown>;
  const value = String(record.default_voice_id ?? "").trim();
  return value || null;
}

async function processOneJob(
  job: JobRow,
  briefing: TikTokGenerateRequest,
  defaultVoiceId: string,
) {
  await updateJob(job.id, "script");
  const script = await generateScriptWithOpenAI(briefing, job.model_id);
  await updateJob(job.id, "audio", {
    script_json: script,
    script_title: script.title,
  });
  const voiceId = briefing.voice_id || defaultVoiceId;
  const audio = await generateAudioWithElevenLabs(script, voiceId);
  await updateJob(job.id, "avatar");
  const { audioPath, audioUrl } = await uploadAudioToStorage(job.briefing_id, job.id, audio);
  await updateJob(job.id, "processing", {
    audio_storage_path: audioPath,
    audio_url: audioUrl,
  });
  const videoId = await createHeygenVideo(
    briefing.avatar_id,
    audioUrl,
    `RadarSmart_${job.model_id}_${briefing.product_name}`,
  );
  const videoUrl = await pollHeygenVideo(videoId);
  await updateJob(job.id, "completed", {
    heygen_video_id: videoId,
    video_url: videoUrl,
    error_message: null,
  });
}

export async function runTikTokPipeline(briefingId: string) {
  const briefingQuery = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .select("*")
    .eq("id", briefingId)
    .maybeSingle();
  if (briefingQuery.error || !briefingQuery.data) {
    throw new Error(briefingQuery.error?.message ?? "Briefing não encontrado.");
  }

  const briefing = briefingQuery.data as unknown as TikTokGenerateRequest;
  await updateBriefingStatus(briefingId, "processing");

  const registeredDefaultVoiceId = await getRegisteredDefaultVoiceId();
  const fallbackVoiceId =
    registeredDefaultVoiceId ||
    (process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "").trim() ||
    (process.env.ELEVENLABS_VOICE_ID ?? "").trim() ||
    "F7823wtD50WK1gnmgBk5";

  const jobsQuery = await supabaseAdmin
    .from("tiktok_engine_jobs")
    .select("id,briefing_id,model_id,model_name")
    .eq("briefing_id", briefingId)
    .order("created_at", { ascending: true });
  if (jobsQuery.error) throw new Error(jobsQuery.error.message);

  const jobs = (jobsQuery.data ?? []) as JobRow[];
  const settled = await Promise.allSettled(
    jobs.map((job) => processOneJob(job, briefing, fallbackVoiceId)),
  );
  const failedCount = settled.filter((result) => result.status === "rejected").length;
  const completedCount = settled.length - failedCount;

  let finalStatus: BriefingStatus = "completed";
  if (completedCount === 0 && failedCount > 0) finalStatus = "failed";
  if (completedCount > 0 && failedCount > 0) finalStatus = "partial_failed";
  await updateBriefingStatus(briefingId, finalStatus);

  await sendWebhook(briefing.webhook_url ?? "", {
    briefing_id: briefingId,
    status: finalStatus,
    summary: { total: settled.length, completed: completedCount, failed: failedCount },
  });
}

export function validateGeneratePayload(payload: unknown): {
  valid: boolean;
  data?: TikTokGenerateRequest;
  error?: string;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Body inválido." };
  }
  const raw = payload as Record<string, unknown>;
  const modelIds = Array.isArray(raw.model_ids)
    ? raw.model_ids.map((item) => Number(item)).filter((item) => Number.isInteger(item))
    : [];
  if (!modelIds.length) return { valid: false, error: "model_ids é obrigatório." };

  const productName = String(raw.product_name ?? "").trim();
  const productPrice = String(raw.product_price ?? "").trim();
  const productBenefits = String(raw.product_benefits ?? "").trim();
  const productPain = String(raw.product_pain ?? "").trim();
  const avatarId = String(raw.avatar_id ?? "").trim();

  if (!productName || !productPrice || !productBenefits || !productPain || !avatarId) {
    return {
      valid: false,
      error:
        "Preencha product_name, product_price, product_benefits, product_pain e avatar_id.",
    };
  }

  if (parsePrice(productPrice) <= 0) {
    return { valid: false, error: "product_price inválido." };
  }

  const cleanedModelIds = modelIds.filter((id) => getModelById(id));
  if (!cleanedModelIds.length) {
    return { valid: false, error: "Nenhum model_id válido enviado." };
  }

  const data: TikTokGenerateRequest = {
    product_name: productName,
    product_price: toBRL(parsePrice(productPrice)),
    product_discount: String(raw.product_discount ?? "").trim() || undefined,
    product_category: String(raw.product_category ?? "").trim() || undefined,
    product_benefits: productBenefits,
    product_pain: productPain,
    competitor_name: String(raw.competitor_name ?? "").trim() || undefined,
    competitor_price: String(raw.competitor_price ?? "").trim() || undefined,
    shop_url: String(raw.shop_url ?? "").trim() || undefined,
    model_ids: cleanedModelIds,
    voice_id: String(raw.voice_id ?? "").trim() || undefined,
    avatar_id: avatarId,
    webhook_url: String(raw.webhook_url ?? "").trim() || undefined,
  };

  return { valid: true, data };
}
