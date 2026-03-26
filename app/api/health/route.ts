import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthCheckResult = {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
};

async function checkAnonClient(): Promise<HealthCheckResult> {
  const { data, error } = await supabase
    .from("offers")
    .select("id")
    .limit(1);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, details: { sampleCount: data?.length ?? 0 } };
}

async function checkAdminClient(): Promise<HealthCheckResult> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id")
    .limit(1);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, details: { sampleCount: data?.length ?? 0 } };
}

export async function GET() {
  try {
    const [anonCheck, adminCheck] = await Promise.all([
      checkAnonClient(),
      checkAdminClient(),
    ]);

    const ok = anonCheck.ok && adminCheck.ok;

    return NextResponse.json({
      ok,
      anon: anonCheck,
      admin: adminCheck,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha no health check",
      },
      { status: 500 },
    );
  }
}