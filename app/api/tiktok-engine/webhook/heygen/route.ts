import { NextRequest, NextResponse } from "next/server";

import { getDistributionFlags } from "@/lib/distribution/feature-flags";
import { scheduleTikTokDistribution } from "@/lib/distribution/tiktok-engine-distribution";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HeygenWebhookPayload = {
  event_type?: string;
  event_data?: {
    video_id?: string;
    url?: string;
    error?: string;
  };
};

async function maybeFinalizeBriefing(briefingId: string) {
  const jobsQuery = await supabaseAdmin
    .from("tiktok_engine_jobs")
    .select("status")
    .eq("briefing_id", briefingId);

  if (jobsQuery.error) throw new Error(jobsQuery.error.message);

  const allJobs = jobsQuery.data ?? [];
  const allDone = allJobs.every(
    (job) => job.status === "completed" || job.status === "failed",
  );

  if (!allDone) return;

  await supabaseAdmin
    .from("tiktok_engine_briefings")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", briefingId);

  const briefingQuery = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .select("webhook_url,product_name")
    .eq("id", briefingId)
    .maybeSingle();
  if (briefingQuery.error || !briefingQuery.data?.webhook_url) return;

  const finalJobsQuery = await supabaseAdmin
    .from("tiktok_engine_jobs")
    .select("*")
    .eq("briefing_id", briefingId);

  await fetch(briefingQuery.data.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "tiktok_engine.completed",
      briefing_id: briefingId,
      product_name: briefingQuery.data.product_name,
      jobs: finalJobsQuery.data ?? [],
    }),
  }).catch(() => undefined);
}

async function maybeAutoDistribute(briefingId: string, jobId: string) {
  const flags = await getDistributionFlags();
  if (!flags.distribution_enabled || !flags.auto_distribute_on_complete) {
    return;
  }

  const channels: Array<"whatsapp" | "telegram" | "instagram"> = [];
  if (flags.channels.whatsapp.enabled) channels.push("whatsapp");
  if (flags.channels.telegram.enabled) channels.push("telegram");
  if (flags.channels.instagram.enabled) channels.push("instagram");

  if (channels.length === 0) {
    return;
  }

  await scheduleTikTokDistribution({
    briefingId,
    jobId,
    channels,
    source: "heygen_complete_auto",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HeygenWebhookPayload;
    const eventType = String(body.event_type ?? "").toLowerCase();
    const videoId = String(body.event_data?.video_id ?? "");

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing video_id" },
        { status: 400 },
      );
    }

    const jobQuery = await supabaseAdmin
      .from("tiktok_engine_jobs")
      .select("id,briefing_id")
      .eq("heygen_video_id", videoId)
      .maybeSingle();

    if (jobQuery.error || !jobQuery.data) {
      return NextResponse.json({ ok: true, message: "Job not found, ignoring" });
    }

    const now = new Date().toISOString();

    if (eventType === "avatar_video.success") {
      await supabaseAdmin
        .from("tiktok_engine_jobs")
        .update({
          status: "completed",
          video_url: body.event_data?.url ?? null,
          error_message: null,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", jobQuery.data.id);

      await maybeFinalizeBriefing(jobQuery.data.briefing_id);
      await maybeAutoDistribute(jobQuery.data.briefing_id, jobQuery.data.id);
      return NextResponse.json({ ok: true, job_id: jobQuery.data.id, status: "completed" });
    }

    if (eventType === "avatar_video.fail") {
      await supabaseAdmin
        .from("tiktok_engine_jobs")
        .update({
          status: "failed",
          error_message:
            body.event_data?.error ?? "HeyGen render failed via webhook",
          completed_at: now,
          updated_at: now,
        })
        .eq("id", jobQuery.data.id);

      await maybeFinalizeBriefing(jobQuery.data.briefing_id);
      return NextResponse.json({ ok: true, status: "failed" });
    }

    return NextResponse.json({ ok: true, message: "Event type not handled" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro no webhook.",
      },
      { status: 500 },
    );
  }
}
