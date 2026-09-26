import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  buildDecisionIntelligenceSummary,
  refreshDecisionOutcomes,
  runDecisionCalibration,
  type DecisionWindow,
} from "@/lib/opportunity-engine/decision-validation-service";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWindow(value: unknown): DecisionWindow | "all" {
  const text = String(value ?? "all").trim();
  return ["1h", "6h", "24h", "72h", "7d"].includes(text) ? (text as DecisionWindow) : "all";
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const days = toNumber(req.nextUrl.searchParams.get("days"), 30);
    const window = normalizeWindow(req.nextUrl.searchParams.get("window"));
    const summary = await buildDecisionIntelligenceSummary(supabaseAdmin, { days, window });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar Decision Intelligence." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();
    const days = toNumber(body.days, 30);
    const window = normalizeWindow(body.window);

    if (action === "refresh_outcomes") {
      const result = await refreshDecisionOutcomes(supabaseAdmin, {
        limit: toNumber(body.limit, 250),
        sinceDays: days,
      });
      const summary = await buildDecisionIntelligenceSummary(supabaseAdmin, { days, window });
      return NextResponse.json({ success: true, result, summary });
    }

    if (action === "calibrate") {
      const result = await runDecisionCalibration(supabaseAdmin, { days, window });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "refresh_and_calibrate") {
      const refresh = await refreshDecisionOutcomes(supabaseAdmin, {
        limit: toNumber(body.limit, 250),
        sinceDays: days,
      });
      const calibration = await runDecisionCalibration(supabaseAdmin, { days, window });
      return NextResponse.json({ success: true, refresh, ...calibration });
    }

    return NextResponse.json({ error: "action invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao processar Decision Intelligence." },
      { status: 500 },
    );
  }
}
