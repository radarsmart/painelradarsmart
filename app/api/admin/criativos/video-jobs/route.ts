import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiVideoJobEvent = {
  status?: string;
  at?: string;
  detail?: string;
  error?: string | null;
};

type AiVideoJobRow = {
  id: string;
  product_name: string | null;
  status: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  status_events: AiVideoJobEvent[] | null;
  original_job_id?: string | null;
  attempt_number?: number | null;
  created_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type VideoJobsKpis = {
  jobsToday: number;
  published: number;
  failed: number;
  averageRenderSeconds: number | null;
};

function getSaoPauloDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getProviderValues(output: Record<string, unknown> | null): string[] {
  if (!output) return [];
  return ["image", "text", "compose", "render", "publish"]
    .map((key) => {
      const item = output[key];
      if (!item || typeof item !== "object") return "";
      return String((item as Record<string, unknown>).provider ?? "").trim();
    })
    .filter(Boolean);
}

function getPublishedUrl(output: Record<string, unknown> | null): string | null {
  const publish = output?.publish;
  if (!publish || typeof publish !== "object") return null;
  const publicUrl = (publish as Record<string, unknown>).publicUrl;
  return typeof publicUrl === "string" && publicUrl.trim() ? publicUrl : null;
}

function getRenderSeconds(events: AiVideoJobEvent[] | null): number | null {
  if (!Array.isArray(events)) return null;
  const started = events.find((event) => event.status === "rendering")?.at;
  const finished = events.find((event) => event.status === "rendered")?.at;
  if (!started || !finished) return null;

  const startMs = Date.parse(started);
  const finishMs = Date.parse(finished);
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) {
    return null;
  }

  return Math.round((finishMs - startMs) / 1000);
}

function normalizeRow(row: AiVideoJobRow) {
  const output = row.output ?? {};
  const providers = getProviderValues(output);
  const events = Array.isArray(row.status_events) ? row.status_events : [];
  const lastEvent = events[events.length - 1] ?? null;

  return {
    ...row,
    input: row.input ?? {},
    output,
    status_events: events,
    providers,
    provider: providers[0] ?? "-",
    published_url: getPublishedUrl(output),
    last_event: lastEvent,
    render_seconds: getRenderSeconds(events),
  };
}

function matchesPeriod(row: AiVideoJobRow, period: string): boolean {
  if (period === "all") return true;
  if (!row.created_at) return false;

  const createdAt = new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) return false;

  if (period === "today") {
    return getSaoPauloDateKey(createdAt) === getSaoPauloDateKey(new Date());
  }

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 7;
  return createdAt.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function buildKpis(rows: AiVideoJobRow[]): VideoJobsKpis {
  const todayKey = getSaoPauloDateKey(new Date());
  const jobsToday = rows.filter((row) => {
    if (!row.created_at) return false;
    return getSaoPauloDateKey(new Date(row.created_at)) === todayKey;
  }).length;
  const published = rows.filter((row) => row.status === "published").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const renderTimes = rows
    .map((row) => getRenderSeconds(row.status_events))
    .filter((value): value is number => typeof value === "number");

  return {
    jobsToday,
    published,
    failed,
    averageRenderSeconds: renderTimes.length
      ? Math.round(renderTimes.reduce((sum, value) => sum + value, 0) / renderTimes.length)
      : null,
  };
}

export async function GET(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const status = request.nextUrl.searchParams.get("status")?.trim() ?? "all";
    const provider = request.nextUrl.searchParams.get("provider")?.trim().toLowerCase() ?? "all";
    const period = request.nextUrl.searchParams.get("period")?.trim() ?? "7d";
    const errorOnly = request.nextUrl.searchParams.get("errorOnly") === "true";

    let query = supabaseAdmin
      .from("ai_video_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (errorOnly) {
      query = query.not("error", "is", null);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: `Falha ao carregar jobs de video: ${error.message}` },
        { status: 500 },
      );
    }

    const rows = ((data ?? []) as AiVideoJobRow[])
      .filter((row) => matchesPeriod(row, period))
      .filter((row) => {
        if (!search) return true;
        return (
          String(row.product_name ?? "").toLowerCase().includes(search) ||
          row.id.toLowerCase().includes(search)
        );
      })
      .filter((row) => {
        if (provider === "all") return true;
        return getProviderValues(row.output).some((value) => value.toLowerCase() === provider);
      });

    const providers = Array.from(
      new Set(rows.flatMap((row) => getProviderValues(row.output))),
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      jobs: rows.map(normalizeRow),
      kpis: buildKpis(rows),
      providers,
      total: rows.length,
    });
  } catch (error) {
    console.error("[/api/admin/criativos/video-jobs] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
