import { NextRequest, NextResponse } from "next/server";

import { getDistributionFlags } from "@/lib/distribution/feature-flags";
import { scheduleTikTokDistribution } from "@/lib/distribution/tiktok-engine-distribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AutoDistributeBody = {
  briefing_id?: string;
  job_id?: string;
  channels?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AutoDistributeBody;
    const briefingId = String(body.briefing_id ?? "").trim();
    if (!briefingId) {
      return NextResponse.json(
        { error: "briefing_id obrigatorio." },
        { status: 400 },
      );
    }

    const flags = await getDistributionFlags();
    if (!flags.auto_distribute_on_complete || !flags.distribution_enabled) {
      return NextResponse.json({
        ok: true,
        message: "Auto-distribute desativado via feature flag",
      });
    }

    const scheduled = await scheduleTikTokDistribution({
      briefingId,
      jobId: String(body.job_id ?? "").trim() || null,
      channels: body.channels as Array<"whatsapp" | "telegram" | "instagram">,
      source: "auto_distribute_webhook",
    });

    return NextResponse.json({
      ok: scheduled.success,
      message: scheduled.message,
      scheduled: scheduled.scheduled,
      skipped_channels: scheduled.skipped_channels,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro no webhook de auto-distribuicao.",
      },
      { status: 500 },
    );
  }
}
