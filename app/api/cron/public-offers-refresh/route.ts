import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { refreshPublicOffers } from "@/lib/offers/public-price-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseBoolean(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMode(value: string | null): "all" | "staleFirst" {
  return String(value ?? "").trim().toLowerCase() === "all" ? "all" : "staleFirst";
}

async function authorize(req: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  const authHeader = String(req.headers.get("authorization") ?? "").trim();

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true as const, actor: "cron" as const };
  }

  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return {
      ok: false as const,
      status: adminGuard.status,
      error: adminGuard.error,
    };
  }

  return { ok: true as const, actor: "admin" as const };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"), 40);
  const mode = parseMode(req.nextUrl.searchParams.get("mode"));
  const forceAll = parseBoolean(req.nextUrl.searchParams.get("forceAll"));

  const summary = await refreshPublicOffers({
    limit,
    mode: forceAll ? "all" : mode,
  });

  return NextResponse.json(
    {
      ok: true,
      actor: auth.actor,
      limit,
      mode: forceAll ? "all" : mode,
      ...summary,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    mode?: "all" | "staleFirst";
    offerIds?: string[];
  };

  const offerIds = Array.isArray(body.offerIds)
    ? body.offerIds.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const summary = await refreshPublicOffers({
    limit: typeof body.limit === "number" ? body.limit : 120,
    mode: body.mode === "all" ? "all" : "staleFirst",
    offerIds,
  });

  return NextResponse.json(
    {
      ok: true,
      actor: auth.actor,
      limit: typeof body.limit === "number" ? body.limit : 120,
      mode: body.mode === "all" ? "all" : "staleFirst",
      ...summary,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
