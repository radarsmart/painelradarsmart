import { NextRequest, NextResponse } from "next/server";

import {
  refreshDecisionOutcomes,
  runDecisionCalibration,
} from "@/lib/opportunity-engine/decision-validation-service";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isValidCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const headerToken =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return String(headerToken).trim() === expected;
}

export async function GET(req: NextRequest) {
  if (!isValidCronSecret(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const refresh = await refreshDecisionOutcomes(supabaseAdmin, { limit: 500, sinceDays: 30 });
    const calibration = await runDecisionCalibration(supabaseAdmin, { days: 30, window: "all" });
    return NextResponse.json({
      ok: true,
      refresh,
      calibration_run_id: calibration.calibration_run_id,
      sample_size: calibration.summary.sample_size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao rodar Decision Validation." },
      { status: 500 },
    );
  }
}
