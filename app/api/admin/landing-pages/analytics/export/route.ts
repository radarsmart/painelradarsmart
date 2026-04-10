import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LandingPageClickRow = {
  id: string;
  landing_page_id: string | null;
  slug: string | null;
  cta_type: string | null;
  destination_url: string | null;
  utm_params: Record<string, string> | null;
  created_at: string | null;
};

type LandingPageRow = {
  id: string;
  title: string | null;
  slug: string | null;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePeriod(raw: string | null) {
  const value = toText(raw).toLowerCase();
  if (value === "1" || value === "7" || value === "30" || value === "90") return value;
  if (value === "all") return "all";
  return "7";
}

function resolveDateFloor(period: string) {
  if (period === "all") return null;
  const days = Number(period);
  if (!Number.isFinite(days)) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function csvEscape(value: unknown) {
  const text = toText(value);
  if (!text) return "";
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const period = normalizePeriod(req.nextUrl.searchParams.get("period"));
    const requestedCampaign = toText(req.nextUrl.searchParams.get("campaign"));
    const dateFloor = resolveDateFloor(period);

    const [landingPagesResult, clicksResult] = await Promise.all([
      supabaseAdmin.from("landing_pages").select("id,title,slug"),
      (() => {
        let query = supabaseAdmin
          .from("landing_page_clicks")
          .select("id,landing_page_id,slug,cta_type,destination_url,utm_params,created_at")
          .order("created_at", { ascending: false })
          .limit(10000);

        if (dateFloor) {
          query = query.gte("created_at", dateFloor);
        }

        return query;
      })(),
    ]);

    if (landingPagesResult.error) {
      throw new Error(landingPagesResult.error.message);
    }

    if (clicksResult.error) {
      throw new Error(clicksResult.error.message);
    }

    const landingPages = (landingPagesResult.data ?? []) as LandingPageRow[];
    const landingMap = new Map(
      landingPages.map((page) => [page.id, { title: toText(page.title), slug: toText(page.slug) }]),
    );

    let clicks = (clicksResult.data ?? []) as LandingPageClickRow[];
    if (requestedCampaign) {
      clicks = clicks.filter(
        (click) =>
          toText(click.utm_params?.utm_campaign).toLowerCase() === requestedCampaign.toLowerCase(),
      );
    }

    const header = [
      "click_id",
      "landing_page_id",
      "landing_title",
      "landing_slug",
      "cta_type",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "destination_url",
      "created_at",
    ];

    const rows = clicks.map((click) => {
      const landingId = toText(click.landing_page_id);
      const landing = landingMap.get(landingId);
      return [
        click.id,
        landingId,
        landing?.title || toText(click.slug) || "Landing page",
        landing?.slug || toText(click.slug),
        toText(click.cta_type),
        toText(click.utm_params?.utm_source),
        toText(click.utm_params?.utm_medium),
        toText(click.utm_params?.utm_campaign),
        toText(click.utm_params?.utm_content),
        toText(click.destination_url),
        toText(click.created_at),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(";"))
      .join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="landing-pages-clicks-${period}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao exportar CSV das landing pages.",
      },
      { status: 500 },
    );
  }
}
