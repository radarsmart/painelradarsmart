import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SalesAgentRow = {
  id: string;
  name: string | null;
  source: string | null;
  active: boolean | null;
  last_run_at: string | null;
};

type PostTargetRow = {
  id: string;
  niche: string | null;
};

type PostQueueRow = {
  id: string | number;
  agent_id: string | null;
  target_id: string | null;
  offer_id: string | null;
  status: string | null;
  created_at: string | null;
};

type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  click_count: number | string | null;
  marketplace: string | null;
  created_at: string | null;
};

type Bucket = { queued: number; sent: number; failed: number; offerIds: Set<string> };

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newBucket(): Bucket {
  return { queued: 0, sent: 0, failed: 0, offerIds: new Set() };
}

function bumpBucket(bucket: Bucket, status: string) {
  if (status === "sent") bucket.sent += 1;
  else if (status === "failed") bucket.failed += 1;
  else bucket.queued += 1;
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 180) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [agentsRes, targetsRes, queueRes] = await Promise.all([
      supabaseAdmin.from("sales_agents").select("id,name,source,active,last_run_at"),
      supabaseAdmin.from("post_targets").select("id,niche"),
      supabaseAdmin
        .from("post_queue")
        .select("id,agent_id,target_id,offer_id,status,created_at")
        .not("agent_id", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    if (agentsRes.error) throw new Error(agentsRes.error.message);
    if (targetsRes.error) throw new Error(targetsRes.error.message);
    if (queueRes.error) throw new Error(queueRes.error.message);

    const agents = (agentsRes.data ?? []) as SalesAgentRow[];
    const targets = (targetsRes.data ?? []) as PostTargetRow[];
    const queueRows = (queueRes.data ?? []) as PostQueueRow[];

    const nicheByTarget = new Map(targets.map((target) => [target.id, toText(target.niche) || "Sem nicho"]));
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    const offerIds = Array.from(new Set(queueRows.map((row) => toText(row.offer_id)).filter(Boolean)));
    let offers: OfferRow[] = [];
    if (offerIds.length) {
      const { data, error } = await supabaseAdmin
        .from("offers")
        .select("id,title,price,click_count,marketplace,created_at")
        .in("id", offerIds);
      if (error) throw new Error(error.message);
      offers = (data ?? []) as OfferRow[];
    }
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));

    const byAgentMap = new Map<string, Bucket>();
    const byNicheMap = new Map<string, Bucket>();
    const offerAgentMap = new Map<string, string>();

    for (const row of queueRows) {
      const agentId = toText(row.agent_id);
      const offerId = toText(row.offer_id);
      const status = toText(row.status).toLowerCase();
      const niche = row.target_id ? nicheByTarget.get(toText(row.target_id)) ?? "Sem nicho" : "Sem nicho";

      if (agentId) {
        const bucket = byAgentMap.get(agentId) ?? newBucket();
        bumpBucket(bucket, status);
        if (offerId) bucket.offerIds.add(offerId);
        byAgentMap.set(agentId, bucket);
        if (offerId && !offerAgentMap.has(offerId)) offerAgentMap.set(offerId, agentId);
      }

      const nicheBucket = byNicheMap.get(niche) ?? newBucket();
      bumpBucket(nicheBucket, status);
      if (offerId) nicheBucket.offerIds.add(offerId);
      byNicheMap.set(niche, nicheBucket);
    }

    function clicksForOfferIds(ids: Set<string>): number {
      let total = 0;
      for (const id of ids) {
        total += toNumber(offerById.get(id)?.click_count);
      }
      return total;
    }

    const byAgent = agents
      .map((agent) => {
        const bucket = byAgentMap.get(agent.id) ?? newBucket();
        const clicks = clicksForOfferIds(bucket.offerIds);
        return {
          agentId: agent.id,
          name: toText(agent.name) || "Agente sem nome",
          source: toText(agent.source),
          active: Boolean(agent.active),
          lastRunAt: agent.last_run_at,
          queued: bucket.queued,
          sent: bucket.sent,
          failed: bucket.failed,
          offersCreated: bucket.offerIds.size,
          clicks,
          conversionRate: bucket.sent > 0 ? Math.round((clicks / bucket.sent) * 100) : 0,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.sent - a.sent);

    const byNiche = Array.from(byNicheMap.entries())
      .map(([niche, bucket]) => {
        const clicks = clicksForOfferIds(bucket.offerIds);
        return {
          niche,
          queued: bucket.queued,
          sent: bucket.sent,
          failed: bucket.failed,
          offersCreated: bucket.offerIds.size,
          clicks,
          conversionRate: bucket.sent > 0 ? Math.round((clicks / bucket.sent) * 100) : 0,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.sent - a.sent);

    const topOffers = offers
      .map((offer) => {
        const agentId = offerAgentMap.get(offer.id);
        return {
          id: offer.id,
          title: toText(offer.title) || "Oferta",
          price: toNumber(offer.price),
          clickCount: toNumber(offer.click_count),
          marketplace: toText(offer.marketplace),
          agentName: agentId ? toText(agentById.get(agentId)?.name) || "-" : "-",
          createdAt: offer.created_at,
        };
      })
      .sort((a, b) => b.clickCount - a.clickCount)
      .slice(0, 20);

    const summary = {
      totalAgents: agents.length,
      activeAgents: agents.filter((agent) => agent.active).length,
      totalQueued: queueRows.length,
      totalSent: queueRows.filter((row) => toText(row.status).toLowerCase() === "sent").length,
      totalFailed: queueRows.filter((row) => toText(row.status).toLowerCase() === "failed").length,
      totalClicks: byAgent.reduce((acc, item) => acc + item.clicks, 0),
    };

    return NextResponse.json(
      { summary, byAgent, byNiche, topOffers, days },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao carregar performance dos agentes.",
      },
      { status: 500 },
    );
  }
}
