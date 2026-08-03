import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinAdvertiserPerformance } from "@/lib/awin/client";
import { supabaseAdmin } from "@/lib/supabase";

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getAwinCommissionSummary() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000); // 30 dias (limite da API e 31)

  try {
    const rows = await fetchAwinAdvertiserPerformance({
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
    });

    return {
      available: true,
      periodStart: formatDateOnly(start),
      periodEnd: formatDateOnly(end),
      advertisers: rows,
      totals: rows.reduce(
        (acc, row) => ({
          clicks: acc.clicks + row.clicks,
          pendingCommission: acc.pendingCommission + row.pendingCommission,
          confirmedCommission: acc.confirmedCommission + row.confirmedCommission,
          declinedCommission: acc.declinedCommission + row.declinedCommission,
        }),
        { clicks: 0, pendingCommission: 0, confirmedCommission: 0, declinedCommission: 0 },
      ),
      error: null as string | null,
    };
  } catch (error) {
    return {
      available: false,
      periodStart: formatDateOnly(start),
      periodEnd: formatDateOnly(end),
      advertisers: [] as Awaited<ReturnType<typeof fetchAwinAdvertiserPerformance>>,
      totals: { clicks: 0, pendingCommission: 0, confirmedCommission: 0, declinedCommission: 0 },
      error: error instanceof Error ? error.message : "Falha ao consultar comissao AWIN.",
    };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AwinOfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  slot_type: string | null;
  status: string | null;
  curations_status: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  click_count: number | string | null;
  affiliate_url: string | null;
};

type ClickRow = {
  id?: string | number | null;
  offer_id?: string | null;
  source?: string | null;
  type?: string | null;
  created_at?: string | null;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function isAfter(value: string | null | undefined, reference: Date): boolean {
  const parsed = Date.parse(toText(value));
  return Number.isFinite(parsed) && parsed >= reference.getTime();
}

function buildSourceBreakdown(clicks: ClickRow[]) {
  const counts = new Map<string, number>();
  for (const click of clicks) {
    const source = toText(click.source) || "sem_origem";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([source, clicksCount]) => ({ source, clicks: clicksCount }))
    .sort((a, b) => b.clicks - a.clicks);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const commission = await getAwinCommissionSummary();

    const { data: offersData, error: offersError } = await supabaseAdmin
      .from("offers")
      .select(
        "id,title,price,slot_type,status,curations_status,published_at,created_at,updated_at,click_count,affiliate_url",
      )
      .eq("marketplace", "awin")
      .order("published_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300);

    if (offersError) {
      throw new Error(offersError.message);
    }

    const offers = (offersData ?? []) as AwinOfferRow[];
    const offerIds = offers.map((offer) => offer.id).filter(Boolean);
    let clicks: ClickRow[] = [];

    if (offerIds.length) {
      const { data: clicksData, error: clicksError } = await supabaseAdmin
        .from("clicks")
        .select("id,offer_id,source,type,created_at")
        .in("offer_id", offerIds)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (clicksError) {
        throw new Error(clicksError.message);
      }

      clicks = (clicksData ?? []) as ClickRow[];
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const clickMap = new Map<string, number>();
    for (const click of clicks) {
      const offerId = toText(click.offer_id);
      if (offerId) clickMap.set(offerId, (clickMap.get(offerId) ?? 0) + 1);
    }

    const normalizedOffers = offers.map((offer) => ({
      id: offer.id,
      title: toText(offer.title) || "Oferta AWIN",
      price: toNumber(offer.price),
      slot_type: toText(offer.slot_type),
      status: toText(offer.status),
      curations_status: toText(offer.curations_status),
      published_at: toText(offer.published_at || offer.updated_at || offer.created_at),
      click_count: Math.max(toNumber(offer.click_count), clickMap.get(offer.id) ?? 0),
      affiliate_url: toText(offer.affiliate_url),
    }));

    const activeOffers = normalizedOffers.filter(
      (offer) => offer.status === "active" && offer.curations_status === "approved",
    );
    const clicksToday = clicks.filter((click) => isAfter(click.created_at, today)).length;
    const clicks7d = clicks.filter((click) => isAfter(click.created_at, sevenDaysAgo)).length;
    const sourceBreakdown = buildSourceBreakdown(clicks);
    const topOffers = normalizedOffers
      .slice()
      .sort((a, b) => b.click_count - a.click_count)
      .slice(0, 20);
    const titleById = new Map(normalizedOffers.map((offer) => [offer.id, offer.title]));

    return NextResponse.json(
      {
        summary: {
          totalOffers: normalizedOffers.length,
          activeOffers: activeOffers.length,
          totalClicks: clicks.length,
          clicksToday,
          clicks7d,
          topSource: sourceBreakdown[0]?.source ?? "-",
        },
        topOffers,
        sourceBreakdown,
        recentClicks: clicks.slice(0, 30).map((click) => ({
          id: toText(click.id),
          offer_id: toText(click.offer_id),
          title: titleById.get(toText(click.offer_id)) ?? "Oferta AWIN",
          source: toText(click.source) || "-",
          created_at: toText(click.created_at),
        })),
        commission,
        notes: commission.available
          ? [
              "Cliques e ofertas medidos pelo Radar Smart. Comissao e venda vem direto da API de relatorios da AWIN (ultimos 30 dias).",
              "Comissao \"pendente\" ainda pode ser recusada pela loja; so \"confirmada\" e garantida.",
            ]
          : [
              "Este painel mede cliques e ofertas AWIN registrados pelo Radar Smart.",
              `Nao foi possivel consultar a comissao real da AWIN agora: ${commission.error}`,
            ],
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
          error instanceof Error ? error.message : "Falha ao carregar analytics AWIN.",
      },
      { status: 500 },
    );
  }
}
