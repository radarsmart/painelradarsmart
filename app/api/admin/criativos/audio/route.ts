import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateElevenLabsAudio, measureAudioDurationSeconds } from "@/lib/ugc/audio";
import type { UGCBehaviorDirection, UGCScript, UGCVoiceDirection } from "@/lib/ugc/types";
import { UGC_VOICES, type VoiceKey } from "@/lib/ugc/voices";

// Gera 3 arquivos de audio separados (hook/body/cta) em vez de um so —
// necessario pro fluxo com avatar (OmniHuman): a cena de abertura/
// fechamento com a garota propaganda falando precisa do audio exato
// daquele trecho pra sincronizar os labios, e as cenas de produto no meio
// (Kling) precisam saber a duracao do body pra dimensionar quantas cenas
// gerar. Ver worker-ugc-video e video-jobs/compose.
const SCRIPT_SEGMENTS = ["hook", "body", "cta"] as const;
type ScriptSegment = (typeof SCRIPT_SEGMENTS)[number];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type AudioGenerateBody = {
  projectId?: string;
  voiceKey?: VoiceKey;
  script?: UGCScript;
  voiceDirection?: UGCVoiceDirection;
  behaviorDirection?: UGCBehaviorDirection;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function isVoiceKey(value: string): value is VoiceKey {
  return value in UGC_VOICES;
}

function normalizeScript(value: unknown): UGCScript | null {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!raw) return null;
  return {
    hook: toText(raw.hook),
    body: toText(raw.body),
    cta: toText(raw.cta),
    full_text: toText(raw.full_text),
    tone: toText(raw.tone),
    part1: toText(raw.part1),
    part2: toText(raw.part2),
    part3: toText(raw.part3),
  };
}

function normalizeVoiceDirection(value: unknown): UGCVoiceDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    pace: ["calm", "balanced", "fast"].includes(toText(raw.pace))
      ? (toText(raw.pace) as UGCVoiceDirection["pace"])
      : "balanced",
    pauseStyle: ["clean", "natural", "fragmented"].includes(toText(raw.pauseStyle))
      ? (toText(raw.pauseStyle) as UGCVoiceDirection["pauseStyle"])
      : "natural",
    emotionalIntensity: ["low", "medium", "high"].includes(toText(raw.emotionalIntensity))
      ? (toText(raw.emotionalIntensity) as UGCVoiceDirection["emotionalIntensity"])
      : "medium",
    urgency: ["low", "medium", "high"].includes(toText(raw.urgency))
      ? (toText(raw.urgency) as UGCVoiceDirection["urgency"])
      : "medium",
    credibility: ["low", "medium", "high"].includes(toText(raw.credibility))
      ? (toText(raw.credibility) as UGCVoiceDirection["credibility"])
      : "high",
    ctaPressure: ["soft", "balanced", "strong"].includes(toText(raw.ctaPressure))
      ? (toText(raw.ctaPressure) as UGCVoiceDirection["ctaPressure"])
      : "balanced",
  };
}

function normalizeBehaviorDirection(value: unknown): UGCBehaviorDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    eyeContact: ["soft", "balanced", "strong"].includes(toText(raw.eyeContact))
      ? (toText(raw.eyeContact) as UGCBehaviorDirection["eyeContact"])
      : "balanced",
    gestureIntensity: ["low", "medium", "high"].includes(toText(raw.gestureIntensity))
      ? (toText(raw.gestureIntensity) as UGCBehaviorDirection["gestureIntensity"])
      : "medium",
    smileLevel: ["low", "medium", "high"].includes(toText(raw.smileLevel))
      ? (toText(raw.smileLevel) as UGCBehaviorDirection["smileLevel"])
      : "low",
    imperfectionLevel: ["low", "medium", "high"].includes(toText(raw.imperfectionLevel))
      ? (toText(raw.imperfectionLevel) as UGCBehaviorDirection["imperfectionLevel"])
      : "medium",
    cameraEnergy: ["calm", "balanced", "dynamic"].includes(toText(raw.cameraEnergy))
      ? (toText(raw.cameraEnergy) as UGCBehaviorDirection["cameraEnergy"])
      : "balanced",
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as AudioGenerateBody;
    const projectId = toText(body.projectId);
    if (!projectId) {
      return NextResponse.json({ error: "projectId é obrigatório." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("ugc_projects")
      .select(
        "id,title,voice_key,current_script,voice_direction,behavior_direction",
      )
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error(projectError?.message || "Projeto não encontrado.");
    }

    const requestedVoiceKey = toText(body.voiceKey);
    const voiceKey: VoiceKey = isVoiceKey(requestedVoiceKey)
      ? requestedVoiceKey
      : isVoiceKey(toText(project.voice_key))
        ? (toText(project.voice_key) as VoiceKey)
        : "mateus";

    const script = normalizeScript(body.script) ?? normalizeScript(project.current_script);
    if (!script?.hook || !script?.body || !script?.cta) {
      return NextResponse.json(
        { error: "O roteiro precisa ter hook, body e cta preenchidos antes de gerar o áudio." },
        { status: 400 },
      );
    }

    const voiceDirection = normalizeVoiceDirection(
      body.voiceDirection ?? project.voice_direction,
    );
    const behaviorDirection = normalizeBehaviorDirection(
      body.behaviorDirection ?? project.behavior_direction,
    );

    const voice = UGC_VOICES[voiceKey];
    const bucket = "ugc-assets";
    const assets = [];

    for (const segment of SCRIPT_SEGMENTS) {
      const audio = await generateElevenLabsAudio({
        text: script[segment as ScriptSegment],
        voiceId: voice.id,
        voiceDirection,
        behaviorDirection,
      });

      const fileId = randomUUID();
      const storagePath = `projects/${projectId}/audio/${fileId}_${segment}.mp3`;

      const uploadResult = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, audio.buffer, {
          contentType: audio.mimeType,
          upsert: true,
        });
      if (uploadResult.error) throw new Error(uploadResult.error.message);

      const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
      const durationSeconds = await measureAudioDurationSeconds(publicUrlData.publicUrl);

      const { data: asset, error: assetError } = await supabaseAdmin
        .from("ugc_project_assets")
        .insert({
          project_id: projectId,
          asset_type: "audio",
          provider: "elevenlabs",
          bucket_name: bucket,
          storage_path: storagePath,
          public_url: publicUrlData.publicUrl,
          mime_type: audio.mimeType,
          size_bytes: audio.buffer.byteLength,
          status: "ready",
          metadata: {
            segment,
            durationSeconds,
            voiceKey,
            voiceName: voice.name,
            voiceStyle: voice.style,
            voiceSettings: audio.settings,
            scriptLength: script[segment as ScriptSegment].length,
            projectTitle: project.title,
          },
          created_by_user_id: adminGuard.userId,
          created_by_email: adminGuard.email,
          updated_at: new Date().toISOString(),
        })
        .select(
          "id,project_id,asset_type,provider,bucket_name,storage_path,public_url,mime_type,size_bytes,status,metadata,created_at,updated_at",
        )
        .single();

      if (assetError) throw new Error(assetError.message);
      assets.push(asset);
    }

    await supabaseAdmin
      .from("ugc_projects")
      .update({
        voice_key: voiceKey,
        voice_direction: voiceDirection,
        behavior_direction: behaviorDirection,
        current_script: script,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return NextResponse.json({ success: true, assets, asset: assets[assets.length - 1] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao gerar áudio do criativo.",
      },
      { status: 500 },
    );
  }
}
