import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { classifyProduct } from "@/lib/ugc/product-classifier";
import {
  DAILY_VIDEO_GENERATION_CAP,
  estimateJobCostCents,
  getSaoPauloDateKey,
} from "@/lib/ugc/generation-config";
import { buildAvatarScenePlan, buildScenePlan } from "@/lib/ugc/scene-prompt-builder";
import type {
  UGCMarketingAngle,
  UGCOfferContext,
  UGCPersonaProfile,
  UGCTemplateProfile,
} from "@/lib/ugc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // so monta o plano e grava a fila — a geracao roda no worker

// Antes esta rota rodava Freepik + ffmpeg inteiro numa unica requisicao (ate
// 5min), sem retry e caindo silenciosamente pra estoque generico em
// qualquer falha. Agora ela so monta o plano de cenas e grava a fila
// (ugc_video_jobs/ugc_video_job_scenes); quem gera de verdade e o worker
// assincrono (Edge Function worker-ugc-video, acionada por cron a cada
// minuto) + a rota de composicao final em video-jobs/compose.

function mapPersona(row: Record<string, unknown> | null): UGCPersonaProfile | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    archetype: String(row.archetype ?? ""),
    genderPresentation: (row.gender_presentation as string) ?? null,
    ageRange: (row.age_range as string) ?? null,
    visualStyle: (row.visual_style as string) ?? null,
    tone: (row.tone as string) ?? null,
    energy: (row.energy as string) ?? null,
    accent: (row.accent as string) ?? null,
    primaryUseCases: Array.isArray(row.primary_use_cases)
      ? (row.primary_use_cases as unknown[]).map((item) => String(item))
      : [],
    provider: (row.provider as string) ?? null,
    providerAvatarId: (row.provider_avatar_id as string) ?? null,
    providerVoiceId: (row.provider_voice_id as string) ?? null,
    avatarImageUrl: (row.avatar_image_url as string) ?? null,
    isDefault: Boolean(row.is_default),
  };
}

function mapTemplate(row: Record<string, unknown> | null): UGCTemplateProfile | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    objective: (row.objective as string) ?? null,
    description: (row.description as string) ?? null,
    hookFramework: (row.hook_framework as string) ?? null,
    structureSteps: Array.isArray(row.structure_steps)
      ? (row.structure_steps as unknown[]).map((item) => String(item))
      : [],
    recommendedDuration: (row.recommended_duration as string) ?? null,
    ctaStyle: (row.cta_style as string) ?? null,
  };
}

function mapAngle(row: Record<string, unknown> | null): UGCMarketingAngle | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    angleType: (row.angle_type as string) ?? null,
    description: (row.description as string) ?? null,
    painPoints: Array.isArray(row.pain_points) ? (row.pain_points as unknown[]).map(String) : [],
    desirePoints: Array.isArray(row.desire_points) ? (row.desire_points as unknown[]).map(String) : [],
    proofPoints: Array.isArray(row.proof_points) ? (row.proof_points as unknown[]).map(String) : [],
    hookStarters: Array.isArray(row.hook_starters) ? (row.hook_starters as unknown[]).map(String) : [],
    ctaOptions: Array.isArray(row.cta_options) ? (row.cta_options as unknown[]).map(String) : [],
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId é obrigatório." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("ugc_projects")
      .select("*, ugc_personas(*), ugc_templates(*), ugc_angles(*)")
      .eq("id", projectId)
      .single();
    if (projectError || !project) throw new Error(projectError?.message || "Projeto não encontrado.");

    // A narracao agora sempre vem em 3 pedacos (hook/body/cta), pra dar
    // suporte a cena heygen-avatar sincronizar so o trecho dela — ver
    // app/api/admin/criativos/audio/route.ts.
    const SCRIPT_SEGMENTS = ["hook", "body", "cta"] as const;
    const { data: audioRows, error: audioError } = await supabaseAdmin
      .from("ugc_project_assets")
      .select("public_url,metadata")
      .eq("project_id", projectId)
      .eq("asset_type", "audio")
      .eq("status", "ready")
      .order("created_at", { ascending: false });
    if (audioError) throw new Error(audioError.message);

    const audioBySegment = new Map<string, { url: string; durationSeconds: number }>();
    for (const row of audioRows ?? []) {
      const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
      const segment = String(metadata.segment ?? "");
      if (
        SCRIPT_SEGMENTS.includes(segment as (typeof SCRIPT_SEGMENTS)[number]) &&
        !audioBySegment.has(segment) &&
        row.public_url
      ) {
        audioBySegment.set(segment, {
          url: row.public_url,
          durationSeconds: Number(metadata.durationSeconds) || 0,
        });
      }
    }
    if (SCRIPT_SEGMENTS.some((segment) => !audioBySegment.has(segment))) {
      return NextResponse.json(
        { error: "Gere o áudio do projeto (hook/body/cta) antes de gerar o vídeo." },
        { status: 400 },
      );
    }

    // Limite diario de seguranca (custo) — conta qualquer job criado hoje
    // (fuso Sao Paulo), independente do status final.
    const todayKey = getSaoPauloDateKey(new Date());
    const { data: recentJobs, error: recentJobsError } = await supabaseAdmin
      .from("ugc_video_jobs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (recentJobsError) throw new Error(recentJobsError.message);
    const jobsToday = (recentJobs ?? []).filter(
      (row) => getSaoPauloDateKey(new Date(row.created_at as string)) === todayKey,
    ).length;
    if (jobsToday >= DAILY_VIDEO_GENERATION_CAP) {
      return NextResponse.json(
        {
          error: `Limite diário de ${DAILY_VIDEO_GENERATION_CAP} vídeos gerados atingido. Tente novamente amanhã.`,
        },
        { status: 429 },
      );
    }

    const discountPct =
      project.original_price && project.price
        ? Math.round(((project.original_price - project.price) / project.original_price) * 100)
        : undefined;

    const offerContext: UGCOfferContext = {
      title: project.title,
      price: project.price,
      originalPrice: project.original_price ?? undefined,
      marketplace: project.marketplace || "Radar Smart",
      category: project.category ?? undefined,
      productUrl: project.product_url,
      campaignName: project.campaign_name ?? undefined,
      objective: project.objective ?? undefined,
      discountPct,
      persona: mapPersona(project.ugc_personas),
      template: mapTemplate(project.ugc_templates),
      angle: mapAngle(project.ugc_angles),
    };

    // Classificacao (Modulo 1) so pra enriquecer a linguagem das cenas
    // (publico-alvo) — se falhar, segue sem ela em vez de travar o video.
    const classification = await classifyProduct({
      title: offerContext.title,
      price: offerContext.price,
      category: offerContext.category ?? null,
      marketplace: offerContext.marketplace,
      discountPct: offerContext.discountPct ?? null,
    }).catch((error) => {
      console.warn("Classificacao de produto falhou, seguindo sem ela:", error);
      return null;
    });

    const avatarImageUrl = offerContext.persona?.avatarImageUrl;
    const scenes = avatarImageUrl
      ? buildAvatarScenePlan(offerContext, classification, project.image_url, {
          imageUrl: avatarImageUrl,
          hookAudioUrl: audioBySegment.get("hook")!.url,
          hookDurationSeconds: audioBySegment.get("hook")!.durationSeconds || 5,
          bodyDurationSeconds: audioBySegment.get("body")!.durationSeconds || 10,
          ctaAudioUrl: audioBySegment.get("cta")!.url,
          ctaDurationSeconds: audioBySegment.get("cta")!.durationSeconds || 5,
        })
      : buildScenePlan(offerContext, classification, project.image_url);
    const costEstimateCents = estimateJobCostCents(scenes.map((scene) => scene.type));

    const { data: job, error: jobError } = await supabaseAdmin
      .from("ugc_video_jobs")
      .insert({
        project_id: projectId,
        status: "queued",
        scene_plan: scenes,
        cost_estimate_cents: costEstimateCents,
        created_by_user_id: adminGuard.userId,
        created_by_email: adminGuard.email,
      })
      .select()
      .single();
    if (jobError) throw new Error(jobError.message);

    const sceneRows = scenes.map((scene, index) => ({
      job_id: job.id,
      scene_index: index,
      scene_type: scene.type,
      // Cenas ffmpeg-text nao dependem de nenhum provedor de IA — sao
      // renderizadas localmente na composicao final, entao ja nascem
      // "ready" pra fila nao tentar submete-las a lugar nenhum.
      status: scene.type === "ffmpeg-text" ? "ready" : "pending",
      prompt: scene.prompt ?? null,
    }));

    const { error: sceneInsertError } = await supabaseAdmin
      .from("ugc_video_job_scenes")
      .insert(sceneRows);
    if (sceneInsertError) throw new Error(sceneInsertError.message);

    await supabaseAdmin.from("ugc_video_job_events").insert({
      job_id: job.id,
      event_type: "job_queued",
      detail: { scenes_count: scenes.length, cost_estimate_cents: costEstimateCents },
    });

    return NextResponse.json({ success: true, jobId: job.id, scenesCount: scenes.length });
  } catch (error) {
    console.error("Video Enqueue Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao enfileirar vídeo." },
      { status: 500 },
    );
  }
}
