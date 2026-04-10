import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LandingPageRow = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
};

type LandingPageClickRow = {
  id: string;
  landing_page_id: string | null;
  offer_id: string | null;
  slug: string | null;
  cta_type: string | null;
  destination_url: string | null;
  utm_params: Record<string, string> | null;
  created_at: string | null;
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

function classifyCtaType(ctaType: string) {
  const normalized = toText(ctaType).toLowerCase();
  if (normalized.startsWith("affiliate")) return "affiliate";
  if (normalized.startsWith("group")) return "group";
  if (normalized.startsWith("site")) return "site";
  if (
    normalized.includes("instagram") ||
    normalized.includes("telegram") ||
    normalized.includes("whatsapp") ||
    normalized.includes("social")
  ) {
    return "social";
  }
  return "other";
}

function buildCountBreakdown(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = toText(value) || "sem_valor";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, clicks]) => ({ value, clicks }))
    .sort((a, b) => b.clicks - a.clicks);
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
      supabaseAdmin
        .from("landing_pages")
        .select("id,title,slug,status")
        .order("updated_at", { ascending: false }),
      (() => {
        let query = supabaseAdmin
          .from("landing_page_clicks")
          .select(
            "id,landing_page_id,offer_id,slug,cta_type,destination_url,utm_params,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(5000);

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
    let clicks = (clicksResult.data ?? []) as LandingPageClickRow[];

    if (requestedCampaign) {
      clicks = clicks.filter(
        (click) =>
          toText(click.utm_params?.utm_campaign).toLowerCase() === requestedCampaign.toLowerCase(),
      );
    }

    const landingMap = new Map(
      landingPages.map((page) => [
        page.id,
        {
          id: page.id,
          title: toText(page.title) || "Landing page",
          slug: toText(page.slug),
          status: toText(page.status) || "draft",
        },
      ]),
    );

    const clicksByLanding = new Map<
      string,
      {
        id: string;
        title: string;
        slug: string;
        status: string;
        totalClicks: number;
        lastClickAt: string | null;
        ctaCounts: Map<string, number>;
        campaigns: string[];
        sources: string[];
      }
    >();

    let affiliateClicks = 0;
    let groupClicks = 0;
    let siteClicks = 0;
    let socialClicks = 0;
    let otherClicks = 0;

    for (const click of clicks) {
      const landingPageId = toText(click.landing_page_id);
      if (!landingPageId) continue;

      const landing = landingMap.get(landingPageId) ?? {
        id: landingPageId,
        title: toText(click.slug) || "Landing page",
        slug: toText(click.slug),
        status: "unknown",
      };

      const current = clicksByLanding.get(landingPageId) ?? {
        id: landingPageId,
        title: landing.title,
        slug: landing.slug,
        status: landing.status,
        totalClicks: 0,
        lastClickAt: null,
        ctaCounts: new Map<string, number>(),
        campaigns: [],
        sources: [],
      };

      current.totalClicks += 1;
      current.lastClickAt = current.lastClickAt ?? (toText(click.created_at) || null);

      const ctaType = toText(click.cta_type) || "unknown";
      current.ctaCounts.set(ctaType, (current.ctaCounts.get(ctaType) ?? 0) + 1);

      const utmCampaign = toText(click.utm_params?.utm_campaign);
      const utmSource = toText(click.utm_params?.utm_source);
      if (utmCampaign) current.campaigns.push(utmCampaign);
      if (utmSource) current.sources.push(utmSource);

      clicksByLanding.set(landingPageId, current);

      const group = classifyCtaType(ctaType);
      if (group === "affiliate") affiliateClicks += 1;
      else if (group === "group") groupClicks += 1;
      else if (group === "site") siteClicks += 1;
      else if (group === "social") socialClicks += 1;
      else otherClicks += 1;
    }

    const campaigns = buildCountBreakdown(
      clicks.map((click) => toText(click.utm_params?.utm_campaign)).filter(Boolean),
    );

    const byLanding = Array.from(clicksByLanding.values())
      .map((landing) => ({
        id: landing.id,
        title: landing.title,
        slug: landing.slug,
        status: landing.status,
        totalClicks: landing.totalClicks,
        lastClickAt: landing.lastClickAt,
        ctaBreakdown: Array.from(landing.ctaCounts.entries())
          .map(([ctaType, count]) => ({ ctaType, count }))
          .sort((a, b) => b.count - a.count),
        topCampaign: buildCountBreakdown(landing.campaigns)[0]?.value ?? "-",
        topSource: buildCountBreakdown(landing.sources)[0]?.value ?? "-",
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks);

    const titleByLandingId = new Map(byLanding.map((landing) => [landing.id, landing.title]));
    const slugByLandingId = new Map(byLanding.map((landing) => [landing.id, landing.slug]));

    return NextResponse.json(
      {
        filters: {
          period,
          campaign: requestedCampaign || "",
          campaigns,
        },
        summary: {
          totalClicks: clicks.length,
          affiliateClicks,
          groupClicks,
          siteClicks,
          socialClicks,
          otherClicks,
          activeLandings: byLanding.length,
          lastClickAt: toText(clicks[0]?.created_at) || null,
        },
        byLanding,
        recentClicks: clicks.slice(0, 40).map((click) => ({
          id: click.id,
          landingPageId: toText(click.landing_page_id),
          title:
            titleByLandingId.get(toText(click.landing_page_id)) ??
            (toText(click.slug) || "Landing page"),
          slug: slugByLandingId.get(toText(click.landing_page_id)) ?? toText(click.slug),
          ctaType: toText(click.cta_type) || "-",
          campaign: toText(click.utm_params?.utm_campaign) || "-",
          source: toText(click.utm_params?.utm_source) || "-",
          createdAt: toText(click.created_at),
          destinationUrl: toText(click.destination_url),
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar analytics das landing pages.",
      },
      { status: 500 },
    );
  }
}
