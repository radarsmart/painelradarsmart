import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { composeVideoFromResolvedScenes, concatAudioFiles, type VideoScene } from "@/lib/ugc/video-composer";

const SCRIPT_SEGMENTS = ["hook", "body", "cta"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutos (Vercel Pro) — so a montagem final roda aqui

// Chamada apenas pela Edge Function worker-ugc-video (Deno), nao pelo admin
// diretamente — por isso usa o mesmo esquema de segredo compartilhado que
// as rotas /api/cron/* ja usam, em vez de requireAdmin (nao ha sessao de
// usuario nessa chamada servidor-a-servidor).
function isValidCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const headerToken =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return String(headerToken).trim() === expected;
}

async function logEvent(jobId: string, eventType: string, detail: Record<string, unknown> = {}) {
  await supabaseAdmin.from("ugc_video_job_events").insert({
    job_id: jobId,
    event_type: eventType,
    detail,
  });
}

export async function POST(req: NextRequest) {
  if (!isValidCronSecret(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { job_id?: unknown };
  const jobId = String(body.job_id ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "job_id e obrigatorio." }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from("ugc_video_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) {
    return NextResponse.json({ error: "Job nao encontrado." }, { status: 404 });
  }

  const tempDir = path.join(process.cwd(), "temp", "renderer");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const audioLocalPath = path.join(tempDir, `${randomUUID()}.mp3`);
  const videoOutputPath = path.join(tempDir, `${randomUUID()}.mp4`);
  const segmentAudioPaths: string[] = [];

  try {
    const { data: project, error: projectError } = await supabaseAdmin
      .from("ugc_projects")
      .select("*")
      .eq("id", job.project_id)
      .single();
    if (projectError || !project) throw new Error(projectError?.message || "Projeto nao encontrado.");

    // A narracao completa agora sempre vem em 3 pedacos (hook/body/cta —
    // ver app/api/admin/criativos/audio/route.ts), gerados assim mesmo
    // pra job sem avatar, pra dar suporte a cena heygen-avatar sincronizar
    // os labios so no trecho dela. A faixa final e sempre a concatenacao
    // dos 3, na mesma ordem das cenas do video.
    const { data: audioRows, error: audioError } = await supabaseAdmin
      .from("ugc_project_assets")
      .select("*")
      .eq("project_id", job.project_id)
      .eq("asset_type", "audio")
      .eq("status", "ready")
      .order("created_at", { ascending: false });
    if (audioError) throw new Error(audioError.message);

    const latestBySegment = new Map<string, { public_url: string }>();
    for (const row of audioRows ?? []) {
      const segment = String((row.metadata as Record<string, unknown> | null)?.segment ?? "");
      if (SCRIPT_SEGMENTS.includes(segment as (typeof SCRIPT_SEGMENTS)[number]) && !latestBySegment.has(segment)) {
        latestBySegment.set(segment, row);
      }
    }
    if (SCRIPT_SEGMENTS.some((segment) => !latestBySegment.has(segment))) {
      throw new Error("Projeto sem audio (hook/body/cta) pronto pra compor o video.");
    }

    for (const segment of SCRIPT_SEGMENTS) {
      const segmentPath = path.join(tempDir, `${randomUUID()}_${segment}.mp3`);
      const content = await fetch(latestBySegment.get(segment)!.public_url).then((res) => res.arrayBuffer());
      fs.writeFileSync(segmentPath, Buffer.from(content));
      segmentAudioPaths.push(segmentPath);
    }
    await concatAudioFiles(segmentAudioPaths, audioLocalPath);

    const { data: jobScenes, error: scenesError } = await supabaseAdmin
      .from("ugc_video_job_scenes")
      .select("*")
      .eq("job_id", jobId)
      .order("scene_index", { ascending: true });
    if (scenesError) throw new Error(scenesError.message);
    if (!jobScenes?.length) throw new Error("Job sem cenas registradas.");

    const scenePlan = Array.isArray(job.scene_plan) ? (job.scene_plan as VideoScene[]) : [];

    // Cenas que esgotaram as tentativas e nao tem nem fallback de estoque
    // (status 'failed') sao descartadas do corte final em vez de travar a
    // composicao inteira — o video sai mais curto, mas sai.
    const usableScenes = jobScenes.filter((row) => row.status === "ready" || row.status === "stock_fallback");
    if (!usableScenes.length) throw new Error("Nenhuma cena ficou pronta pra compor o video.");

    const scenes: VideoScene[] = usableScenes.map((row) => {
      const planned = scenePlan[row.scene_index] ?? {};
      const merged: VideoScene = {
        ...planned,
        type: row.scene_type as VideoScene["type"],
      };
      if (row.scene_type !== "ffmpeg-text") {
        merged.resolvedUrl = row.result_url ?? undefined;
      }
      return merged;
    });

    await logEvent(jobId, "compose_started", {
      scenes_count: scenes.length,
      dropped_scenes: jobScenes.length - usableScenes.length,
    });

    await composeVideoFromResolvedScenes(scenes, audioLocalPath, videoOutputPath);

    const videoBuffer = fs.readFileSync(videoOutputPath);
    const storagePath = `projects/${job.project_id}/video/${randomUUID()}.mp4`;
    const bucket = "ugc-assets";

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(`Falha no upload do video: ${uploadError.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);

    const stockFallbackScenes = jobScenes.filter((row) => row.status === "stock_fallback").length;

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("ugc_project_assets")
      .insert({
        project_id: job.project_id,
        asset_type: "video",
        provider: "ugc-video-queue",
        bucket_name: bucket,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        mime_type: "video/mp4",
        size_bytes: videoBuffer.byteLength,
        status: "ready",
        metadata: {
          scenes_count: scenes.length,
          stock_fallback_scenes: stockFallbackScenes,
          projectTitle: project.title,
          job_id: jobId,
        },
        created_by_user_id: job.created_by_user_id,
        created_by_email: job.created_by_email,
      })
      .select()
      .single();
    if (assetError) throw new Error(assetError.message);

    await supabaseAdmin
      .from("ugc_video_jobs")
      .update({
        status: "completed",
        output_url: publicUrlData.publicUrl,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await logEvent(jobId, "compose_completed", {
      asset_id: asset.id,
      public_url: publicUrlData.publicUrl,
      stock_fallback_scenes: stockFallbackScenes,
    });

    return NextResponse.json({ success: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao compor video.";
    console.error("Video Compose Error:", error);

    await supabaseAdmin
      .from("ugc_video_jobs")
      .update({ status: "failed", error: message, locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    await logEvent(jobId, "compose_failed", { error: message });

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    for (const segmentPath of segmentAudioPaths) {
      try {
        fs.unlinkSync(segmentPath);
      } catch {}
    }
    try {
      fs.unlinkSync(audioLocalPath);
    } catch {}
    try {
      fs.unlinkSync(videoOutputPath);
    } catch {}
  }
}
