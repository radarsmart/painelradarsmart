import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { getDistributionFlags } from "@/lib/distribution/feature-flags";
import { scheduleTikTokDistribution } from "@/lib/distribution/tiktok-engine-distribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DistributeBody = {
  briefing_id?: string;
  job_id?: string;
  channels?: string[];
};

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json()) as DistributeBody;
    const briefingId = String(body.briefing_id ?? "").trim();
    if (!briefingId) {
      return NextResponse.json(
        { error: "briefing_id obrigatorio." },
        { status: 400 },
      );
    }

    const flags = await getDistributionFlags();
    if (!flags.distribution_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "Distribuicao esta desativada. Ative nas configuracoes.",
          flags_url: "/api/admin/distribution/flags",
        },
        { status: 403 },
      );
    }

    const scheduled = await scheduleTikTokDistribution({
      briefingId,
      jobId: String(body.job_id ?? "").trim() || null,
      channels: body.channels as Array<"whatsapp" | "telegram" | "instagram">,
      source: "manual_distribute_route",
    });

    if (!scheduled.success) {
      return NextResponse.json(scheduled, { status: 403 });
    }

    return NextResponse.json(scheduled);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao agendar distribuicao.",
      },
      { status: 500 },
    );
  }
}
