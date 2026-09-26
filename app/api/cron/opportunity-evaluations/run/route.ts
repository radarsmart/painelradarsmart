import { NextRequest, NextResponse } from "next/server";

import { processOpportunityEvaluationJobs } from "@/lib/opportunity-engine/evaluation-queue";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.max(1, Math.min(25, toNumber(req.nextUrl.searchParams.get("limit"), 10)));
  const started = Date.now();
  const result = await processOpportunityEvaluationJobs(supabaseAdmin, { limit });

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
    ...result,
  });
}
