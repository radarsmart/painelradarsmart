import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";
import { getModelById } from "@/lib/tiktok-engine/models";
import { pickHookVariation, resolveHookPlaceholders } from "@/lib/tiktok-engine/hooks";
import { renderTikTokVideoWithRemotion } from "@/lib/tiktok-engine/remotion/render";
import type {
  BriefingStatus,
  JobLogStep,
  JobStatus,
  ScriptPayload,
  TikTokGenerateRequest,
} from "@/lib/tiktok-engine/types";

const AUDIO_BUCKET = "tiktok-engine-assets";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_SCRIPT_OUTPUT_TOKENS = 420;
const HEYGEN_POLL_ATTEMPTS = 24;
const HEYGEN_POLL_INTERVAL_MS = 5000;
const DEFAULT_VIDEO_PROVIDER = "remotion";
const MAX_HOOK_COUNT = 5;

// ─── Utilitários ───────────────────────────────────────────────────────────────

function maskSecretSuffix(secret: string, visible = 4): string {
  const normalized = String(secret ?? "").trim();
  if (!normalized) return "missing";
  if (normalized.length <= visible) return normalized;
  return normalized.slice(-visible);
}

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel ${name} ausente.`);
  return value;
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
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

function buildDurationTargetSeconds(durationLabel: string): number {
  const matches = durationLabel.match(/\d+/g)?.map((item) => Number(item)) ?? [];
  if (!matches.length) return 20;
  if (matches.length === 1) return matches[0]!;
  return Math.round((matches[0]! + matches[1]!) / 2);
}

function getModelPromptBase(modelId: number): string {
  const presets: Record<number, string> = {
    1: "Abra na dor e mostre solucao imediata.",
    2: "Tom sensorial, foco em experiencia e simplicidade.",
    3: "Narrativa pessoal curta com virada clara.",
    4: "Mostre limite real e depois beneficios decisivos.",
    5: "Compare custo-beneficio com contraste direto.",
    6: "Didatico, em passos curtos e praticos.",
    7: "Gancho muito rapido em linguagem nativa.",
    8: "Uso organico no dia a dia com tom natural.",
    9: "Prova social objetiva com urgencia real.",
    10: "Economia concreta e chamada de acao curta.",
  };
  return presets[modelId] ?? "Gancho curto, beneficio claro e CTA objetivo.";
}

// ─── Logs por etapa ───────────────────────────────────────────────────────────

async function appendJobLog(
  jobId: string,
  step: string,
  detail: string,
  ok: boolean,
): Promise<void> {
  try {
    // Busca log_steps atual
    const { data } = await supabaseAdmin
      .from("tiktok_engine_jobs")
      .select("log_steps")
      .eq("id", jobId)
      .maybeSingle();

    const existing: JobLogStep[] = Array.isArray(data?.log_steps) ? (data.log_steps as JobLogStep[]) : [];
    const newEntry: JobLogStep = {
      step,
      detail,
      ok,
      ts: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("tiktok_engine_jobs")
      .update({ log_steps: [...existing, newEntry] })
      .eq("id", jobId);
  } catch {
    // Silencia erros de log — nunca deve bloquear o pipeline
  }
}

// ─── Atualização de Job ───────────────────────────────────────────────────────

async function updateJob(
  jobId: string,
  status: JobStatus,
  patch: Record<string, unknown> = {},
  logStep?: { step: string; detail: string; ok: boolean },
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

  if (logStep) {
    await appendJobLog(jobId, logStep.step, logStep.detail, logStep.ok);
  }
}

// ─── Geração de Roteiro ───────────────────────────────────────────────────────

function buildScriptPrompts(
  input: TikTokGenerateRequest,
  modelId: number,
  hookSuggestion: string,
) {
  const model = getModelById(modelId);
  if (!model) throw new Error(`Modelo ${modelId} nao encontrado.`);

  const durationTargetSeconds = buildDurationTargetSeconds(model.duration);
  const system = [
    "Voce escreve roteiros curtos para TikTok Shop em portugues-BR.",
    "Responda em JSON aderente ao schema.",
    "Frases curtas, ritmo rapido, sem tom institucional.",
    "Nao invente dados e nao use promessas falsas.",
    "CTA final deve direcionar para Radar Smart — nunca mencionar marketplace.",
    `Sugestao de abertura (hook): "${hookSuggestion}" — adapte livremente mantendo o estilo.`,
  ].join(" ");

  const user = [
    `Produto: ${input.product_name}`,
    `Preco: R$ ${input.product_price}`,
    `Desconto: ${input.product_discount ?? "nao informado"}`,
    `Categoria: ${input.product_category ?? "nao informada"}`,
    `Beneficios: ${input.product_benefits}`,
    `Dor principal: ${input.product_pain}`,
    `Concorrente: ${input.competitor_name ?? "nao informado"} (${input.competitor_price ?? "n/a"})`,
    `Modelo: ${model.name}`,
    `Direcao do modelo: ${getModelPromptBase(model.id)} ${model.promptAngle}`,
    `Duracao alvo: ${durationTargetSeconds} segundos`,
    "Regras: hook maximo 14 palavras, body em 2-4 linhas curtas, cta curto.",
    "on_screen_text deve ter entre 3 e 5 linhas curtas.",
    "O hook deve ser impactante e parar o scroll nos primeiros 2 segundos.",
  ].join("\n");

  return { system, user, durationTargetSeconds };
}

type OpenAIResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractResponseText(payload: OpenAIResponsesApiResponse): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function sanitizeScriptPayload(payload: ScriptPayload, durationTargetSeconds: number): ScriptPayload {
  const safeBody = Array.isArray(payload.body)
    ? payload.body.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const safeOnScreen = Array.isArray(payload.on_screen_text)
    ? payload.on_screen_text
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (!payload.title?.trim()) throw new Error("Script sem title.");
  if (!payload.hook?.trim()) throw new Error("Script sem hook.");
  if (!payload.cta?.trim()) throw new Error("Script sem cta.");
  if (safeBody.length === 0) throw new Error("Script sem body.");

  return {
    title: payload.title.trim().slice(0, 120),
    hook: payload.hook.trim().slice(0, 180),
    body: safeBody,
    cta: payload.cta.trim().slice(0, 180),
    caption: String(payload.caption ?? "").trim().slice(0, 260),
    on_screen_text: safeOnScreen,
    duration_target_seconds:
      Number.isFinite(payload.duration_target_seconds) && payload.duration_target_seconds > 0
        ? Math.max(10, Math.min(60, Math.round(payload.duration_target_seconds)))
        : durationTargetSeconds,
  };
}

function buildScriptTextForTTS(script: ScriptPayload): string {
  const blocks = [script.hook, ...script.body, script.cta]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return blocks.join(" ").replace(/\s+/g, " ").trim();
}

async function generateScriptWithOpenAI(
  input: TikTokGenerateRequest,
  modelId: number,
  hookSuggestion: string,
): Promise<{ scriptJson: ScriptPayload; scriptTextFinal: string }> {
  const openAiKey = requiredEnv("OPENAI_API_KEY");
  const { system, user, durationTargetSeconds } = buildScriptPrompts(input, modelId, hookSuggestion);

  console.info("[tiktok-openai]", {
    step: "script_request_start",
    modelId,
    model: OPENAI_MODEL,
    hasKey: Boolean(openAiKey),
    keySuffix: maskSecretSuffix(openAiKey),
    hookSuggestion: hookSuggestion.slice(0, 60),
  });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      hook: { type: "string" },
      body: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      cta: { type: "string" },
      caption: { type: "string" },
      on_screen_text: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
      duration_target_seconds: { type: "number" },
    },
    required: [
      "title",
      "hook",
      "body",
      "cta",
      "caption",
      "on_screen_text",
      "duration_target_seconds",
    ],
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      max_output_tokens: MAX_SCRIPT_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "tiktok_script",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[tiktok-openai]", {
      step: "script_request_failed",
      modelId,
      status: res.status,
      bodyPreview: body.slice(0, 300),
    });
    throw new Error(`OpenAI falhou (${res.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as OpenAIResponsesApiResponse;
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI retornou resposta vazia para script.");

  console.info("[tiktok-openai]", { step: "script_request_ok", modelId });

  const parsed = JSON.parse(text) as ScriptPayload;
  const scriptJson = sanitizeScriptPayload(parsed, durationTargetSeconds);
  const scriptTextFinal = buildScriptTextForTTS(scriptJson);
  if (!scriptTextFinal) throw new Error("script_text_final vazio.");

  return { scriptJson, scriptTextFinal };
}

// ─── Áudio ───────────────────────────────────────────────────────────────────

async function generateAudioWithElevenLabs(scriptText: string, voiceId: string): Promise<Buffer> {
  const elevenApiKey = requiredEnv("ELEVENLABS_API_KEY");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": elevenApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: scriptText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.5,
        speed: 1.12,
        use_speaker_boost: true,
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

// ─── Storage ──────────────────────────────────────────────────────────────────

async function uploadAudioToStorage(briefingId: string, jobId: string, audio: Buffer) {
  const path = `briefings/${briefingId}/audio/${jobId}-${randomUUID()}.mp3`;
  const upload = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (upload.error) throw new Error(`Storage upload falhou: ${upload.error.message}`);
  const publicData = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return { audioPath: path, audioUrl: publicData.data.publicUrl };
}

async function uploadVideoToStorage(briefingId: string, jobId: string, video: Buffer) {
  const path = `briefings/${briefingId}/video/${jobId}-${randomUUID()}.mp4`;
  const upload = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, video, { contentType: "video/mp4", upsert: true });
  if (upload.error) throw new Error(`Video upload falhou: ${upload.error.message}`);
  const publicData = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return { videoPath: path, videoUrl: publicData.data.publicUrl };
}

// ─── HeyGen (Fallback) ────────────────────────────────────────────────────────

async function createHeygenVideo(avatarId: string, audioUrl: string, title: string): Promise<string> {
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
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { Accept: "application/json", "X-Api-Key": heygenApiKey },
    });
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
  throw new Error("Timeout aguardando renderizacao do HeyGen.");
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

async function sendWebhook(url: string, payload: unknown) {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

// ─── Voice Registry ───────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  briefing_id: string;
  model_id: number;
  model_name: string;
  hook_variation_index: number | null;
  hook_variation_text: string | null;
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

// ─── Processamento de 1 Job ───────────────────────────────────────────────────

async function processOneJob(
  job: JobRow,
  briefing: TikTokGenerateRequest,
  defaultVoiceId: string,
) {
  // Usa o hook sorteado no job, fallback para sortear agora se não tiver
  const hookVariationIndex =
    job.hook_variation_index !== null && job.hook_variation_index >= 0
      ? job.hook_variation_index
      : pickHookVariation(job.model_id).index;

  const rawHook = job.hook_variation_text?.trim() || pickHookVariation(job.model_id, hookVariationIndex).text;
  const hookSuggestion = resolveHookPlaceholders(rawHook, {
    productName: briefing.product_name,
    price: briefing.product_price,
    discount: briefing.product_discount,
    competitorPrice: briefing.competitor_price,
  });

  await updateJob(
    job.id,
    "script_generating",
    { error_message: null, hook_variation_index: hookVariationIndex, hook_variation_text: rawHook },
    { step: "script_start", detail: `hook_variation=${hookVariationIndex}`, ok: true },
  );

  let scriptJson: ScriptPayload;
  let scriptTextFinal: string;
  try {
    const generated = await generateScriptWithOpenAI(briefing, job.model_id, hookSuggestion);
    scriptJson = generated.scriptJson;
    scriptTextFinal = generated.scriptTextFinal;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha na etapa de script";
    await updateJob(
      job.id,
      "script_failed",
      { error_message: msg },
      { step: "script_failed", detail: msg, ok: false },
    );
    throw error;
  }

  await updateJob(
    job.id,
    "script_done",
    {
      script_json: { ...scriptJson, script_text_final: scriptTextFinal },
      script_title: scriptJson.title,
      script_text_final: scriptTextFinal,
    },
    { step: "script_done", detail: scriptJson.title, ok: true },
  );

  const voiceId = briefing.voice_id || defaultVoiceId;
  console.info("[tiktok-engine]", {
    briefingId: job.briefing_id,
    jobId: job.id,
    modelId: job.model_id,
    step: "audio_start",
    voiceId,
    hookVariation: hookVariationIndex,
  });

  let audio: Buffer;
  try {
    await updateJob(
      job.id,
      "audio",
      {},
      { step: "audio_start", detail: `voice=${voiceId}`, ok: true },
    );
    audio = await generateAudioWithElevenLabs(scriptTextFinal, voiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na etapa de audio";
    await updateJob(
      job.id,
      "failed",
      { error_message: `audio: ${message}` },
      { step: "audio_failed", detail: message, ok: false },
    );
    throw error;
  }

  let audioPath = "";
  let audioUrl = "";
  try {
    await updateJob(job.id, "avatar");
    const uploaded = await uploadAudioToStorage(job.briefing_id, job.id, audio);
    audioPath = uploaded.audioPath;
    audioUrl = uploaded.audioUrl;

    await updateJob(
      job.id,
      "processing",
      { audio_storage_path: audioPath, audio_url: audioUrl },
      { step: "audio_uploaded", detail: audioPath, ok: true },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no upload/processamento";
    await updateJob(
      job.id,
      "failed",
      {
        audio_storage_path: audioPath || null,
        audio_url: audioUrl || null,
        error_message: `upload: ${message}`,
      },
      { step: "audio_upload_failed", detail: message, ok: false },
    );
    throw error;
  }

  const videoProvider = briefing.video_provider ?? DEFAULT_VIDEO_PROVIDER;
  const allowHeygenFallback =
    videoProvider === "remotion" &&
    Boolean(briefing.avatar_id?.trim()) &&
    isTruthy(process.env.TIKTOK_ENGINE_HEYGEN_FALLBACK);

  try {
    if (videoProvider === "remotion") {
      try {
        await updateJob(
          job.id,
          "rendering_video",
          { video_provider: "remotion" },
          { step: "render_start", detail: `model=${job.model_id} hook=${hookVariationIndex}`, ok: true },
        );

        const rendered = await renderTikTokVideoWithRemotion({
          briefingId: job.briefing_id,
          jobId: job.id,
          modelId: job.model_id,
          audioUrl,
          script: scriptJson,
          input: briefing,
          hookVariationIndex,
        });

        await updateJob(
          job.id,
          "video_uploading",
          {
            render_metadata: {
              provider: rendered.provider,
              composition_id: rendered.compositionId,
              template: rendered.template,
              duration_in_frames: rendered.durationInFrames,
              fps: rendered.fps,
              hook_variation_index: hookVariationIndex,
            },
          },
          { step: "render_done", detail: `template=${rendered.template}`, ok: true },
        );

        const uploadedVideo = await uploadVideoToStorage(job.briefing_id, job.id, rendered.buffer);
        await updateJob(
          job.id,
          "completed",
          {
            video_provider: "remotion",
            video_storage_path: uploadedVideo.videoPath,
            video_url: uploadedVideo.videoUrl,
            error_message: null,
          },
          { step: "completed", detail: uploadedVideo.videoUrl, ok: true },
        );
        return;
      } catch (remotionError) {
        if (!allowHeygenFallback) {
          throw remotionError;
        }

        const fallbackMessage =
          remotionError instanceof Error ? remotionError.message : "Falha no renderer Remotion";
        console.warn("[tiktok-engine]", {
          briefingId: job.briefing_id,
          jobId: job.id,
          step: "remotion_failed_fallback_heygen",
          error: fallbackMessage,
        });
        await appendJobLog(job.id, "remotion_fallback", fallbackMessage, false);
      }
    }

    if (!briefing.avatar_id?.trim()) {
      throw new Error("avatar_id obrigatorio para fallback via HeyGen.");
    }

    await updateJob(
      job.id,
      "video_submitted",
      { video_provider: "heygen" },
      { step: "heygen_submit", detail: briefing.avatar_id, ok: true },
    );
    const videoId = await createHeygenVideo(
      briefing.avatar_id,
      audioUrl,
      `RadarSmart_${job.model_id}_${briefing.product_name}`,
    );
    await updateJob(
      job.id,
      "video_rendering",
      { heygen_video_id: videoId, video_provider: "heygen" },
      { step: "heygen_polling", detail: videoId, ok: true },
    );
    const videoUrl = await pollHeygenVideo(videoId);
    await updateJob(
      job.id,
      "completed",
      { heygen_video_id: videoId, video_url: videoUrl, error_message: null },
      { step: "completed", detail: videoUrl, ok: true },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na etapa de video";
    console.error("[tiktok-engine]", {
      briefingId: job.briefing_id,
      jobId: job.id,
      modelId: job.model_id,
      step: "video_failed",
      voiceId,
      videoProvider,
      error: message,
    });
    await updateJob(
      job.id,
      "failed",
      {
        audio_storage_path: audioPath,
        audio_url: audioUrl,
        error_message: `video: ${message}`,
      },
      { step: "video_failed", detail: message, ok: false },
    );
    throw error;
  }
}

// ─── Runner Principal ─────────────────────────────────────────────────────────

export async function runTikTokPipeline(briefingId: string) {
  console.info("[tiktok-run] pipeline start", { briefingId });

  const briefingQuery = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .select("*")
    .eq("id", briefingId)
    .maybeSingle();
  if (briefingQuery.error || !briefingQuery.data) {
    throw new Error(briefingQuery.error?.message ?? "Briefing nao encontrado.");
  }

  const briefing = briefingQuery.data as unknown as TikTokGenerateRequest;
  await supabaseAdmin
    .from("tiktok_engine_briefings")
    .update({
      status: "processing",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", briefingId);

  const registeredDefaultVoiceId = await getRegisteredDefaultVoiceId();
  const fallbackVoiceId =
    registeredDefaultVoiceId ||
    (process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "").trim() ||
    (process.env.ELEVENLABS_VOICE_ID ?? "").trim() ||
    "F7823wtD50WK1gnmgBk5";

  const jobsQuery = await supabaseAdmin
    .from("tiktok_engine_jobs")
    .select("id,briefing_id,model_id,model_name,hook_variation_index,hook_variation_text")
    .eq("briefing_id", briefingId)
    .order("created_at", { ascending: true });
  if (jobsQuery.error) throw new Error(jobsQuery.error.message);

  const jobs = (jobsQuery.data ?? []) as JobRow[];
  console.info("[tiktok-run] jobs loaded", {
    briefingId,
    jobsCount: jobs.length,
    fallbackVoiceId,
    videoProvider: briefing.video_provider ?? DEFAULT_VIDEO_PROVIDER,
  });

  const settled = await Promise.allSettled(
    jobs.map((job) => processOneJob(job, briefing, fallbackVoiceId)),
  );
  const failedCount = settled.filter((result) => result.status === "rejected").length;
  const completedCount = settled.length - failedCount;
  const firstFailure = settled.find((result) => result.status === "rejected");
  const failureReason =
    firstFailure?.status === "rejected"
      ? firstFailure.reason instanceof Error
        ? firstFailure.reason.message
        : String(firstFailure.reason ?? "Falha desconhecida no pipeline")
      : null;

  let finalStatus: BriefingStatus = "completed";
  if (completedCount === 0 && failedCount > 0) finalStatus = "failed";
  if (completedCount > 0 && failedCount > 0) finalStatus = "partial_failed";
  await supabaseAdmin
    .from("tiktok_engine_briefings")
    .update({
      status: finalStatus,
      last_error: failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", briefingId);

  console.info("[tiktok-run] pipeline finished", {
    briefingId,
    finalStatus,
    completedCount,
    failedCount,
  });

  await sendWebhook(briefing.webhook_url ?? "", {
    briefing_id: briefingId,
    status: finalStatus,
    summary: { total: settled.length, completed: completedCount, failed: failedCount },
  });
}

// ─── Validação de Payload ─────────────────────────────────────────────────────

export function validateGeneratePayload(payload: unknown): {
  valid: boolean;
  data?: TikTokGenerateRequest;
  error?: string;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Body invalido." };
  }
  const raw = payload as Record<string, unknown>;
  const modelIds = Array.isArray(raw.model_ids)
    ? raw.model_ids.map((item) => Number(item)).filter((item) => Number.isInteger(item))
    : [];
  if (!modelIds.length) return { valid: false, error: "model_ids e obrigatorio." };

  const productName = String(raw.product_name ?? "").trim();
  const productPrice = String(raw.product_price ?? "").trim();
  const productBenefits = String(raw.product_benefits ?? "").trim();
  const productPain = String(raw.product_pain ?? "").trim();
  const avatarId = String(raw.avatar_id ?? "").trim();
  const videoProvider =
    String(raw.video_provider ?? "").trim().toLowerCase() === "heygen" ? "heygen" : "remotion";

  const rawHookCount = Number(raw.hook_count ?? 1);
  const hookCount = Number.isInteger(rawHookCount) && rawHookCount >= 1
    ? Math.min(rawHookCount, MAX_HOOK_COUNT)
    : 1;

  if (!productName || !productPrice || !productBenefits || !productPain) {
    return {
      valid: false,
      error: "Preencha product_name, product_price, product_benefits e product_pain.",
    };
  }

  if (parsePrice(productPrice) <= 0) {
    return { valid: false, error: "product_price invalido." };
  }

  const cleanedModelIds = modelIds.filter((id) => getModelById(id));
  if (!cleanedModelIds.length) {
    return { valid: false, error: "Nenhum model_id valido enviado." };
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
    product_image_urls: Array.isArray(raw.product_image_urls)
      ? raw.product_image_urls
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    model_ids: cleanedModelIds,
    hook_count: hookCount,
    voice_id: String(raw.voice_id ?? "").trim() || undefined,
    avatar_id: avatarId || undefined,
    video_provider: videoProvider,
    webhook_url: String(raw.webhook_url ?? "").trim() || undefined,
  };

  if (data.video_provider === "heygen" && !data.avatar_id) {
    return { valid: false, error: "avatar_id e obrigatorio quando video_provider=heygen." };
  }

  return { valid: true, data };
}
