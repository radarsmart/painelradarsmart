import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { dispatchLegacyOffer, type DistributionChannel } from "@/lib/distribution/legacy-dispatch";
import { evaluateOffer } from "@/lib/opportunity-engine/evaluation-service";
import {
  enqueueOpportunityEvaluation,
  processOpportunityEvaluationJobs,
} from "@/lib/opportunity-engine/evaluation-queue";
import { buildSiteManualCopyOverride } from "@/lib/offers/site-visibility";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SORT_COLUMNS = new Set([
  "opportunity_score",
  "opportunity_confidence",
  "radar_real_discount",
  "effective_price",
  "evaluated_at",
  "match_score",
  "market_confidence_score",
  "market_valid_offer_count",
  "demand_confidence_score",
  "trend_velocity",
  "internal_performance_confidence",
  "historical_segment_score",
]);

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeChannels(value: unknown): DistributionChannel[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => toText(item).toLowerCase()))).filter(
    (item): item is DistributionChannel => item === "telegram" || item === "whatsapp",
  );
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, toNumber(params.get("page"), 1));
  const pageSize = Math.max(10, Math.min(100, toNumber(params.get("page_size"), 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sort = SORT_COLUMNS.has(params.get("sort") ?? "")
    ? String(params.get("sort"))
    : "evaluated_at";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  let query = supabaseAdmin
    .from("opportunity_current_state")
    .select("*", { count: "exact" });

  const classification = toText(params.get("classification"));
  const gate = toText(params.get("gate"));
  const marketplace = toText(params.get("marketplace"));
  const category = toText(params.get("category"));
  const minScore = toNumber(params.get("min_score"), NaN);
  const minConfidence = toNumber(params.get("min_confidence"), NaN);
  const minMatch = toNumber(params.get("min_match"), NaN);
  const minRealDiscount = toNumber(params.get("min_real_discount"), NaN);

  if (classification) query = query.eq("classification", classification);
  if (gate) query = query.eq("publishing_gate_status", gate);
  if (marketplace) query = query.ilike("marketplace", `%${marketplace}%`);
  if (category) query = query.ilike("category", `%${category}%`);
  if (Number.isFinite(minScore)) query = query.gte("opportunity_score", minScore);
  if (Number.isFinite(minConfidence)) query = query.gte("opportunity_confidence", minConfidence);
  if (Number.isFinite(minMatch)) query = query.gte("match_score", minMatch);
  if (Number.isFinite(minRealDiscount)) query = query.gte("radar_real_discount", minRealDiscount);
  if (params.get("with_pix") === "true") query = query.not("pix_price", "is", null);
  if (params.get("with_installments") === "true") {
    query = query.not("installment_count", "is", null);
  }

  const { data, error, count } = await query
    .order(sort, { ascending: direction === "asc", nullsFirst: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    opportunities: data ?? [],
    pagination: {
      page,
      page_size: pageSize,
      total: count ?? 0,
      total_pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    },
  });
}

async function publishNow(offerId: string, channels: DistributionChannel[]) {
  const { data: state, error: stateError } = await supabaseAdmin
    .from("opportunity_current_state")
    .select("offer_id,publishing_gate_status,blocking_reasons,affiliate_url")
    .eq("offer_id", offerId)
    .maybeSingle();

  if (stateError) throw new Error(stateError.message);
  if (!state) throw new Error("Oferta ainda nao possui avaliacao de oportunidade.");
  if (state.publishing_gate_status !== "APPROVED") {
    const reasons = Array.isArray(state.blocking_reasons)
      ? state.blocking_reasons.map(String).join(" | ")
      : "";
    throw new Error(`Publicacao bloqueada pelo Publishing Gate.${reasons ? ` ${reasons}` : ""}`);
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data: offer, error } = await supabaseAdmin
    .from("offers")
    .select("id,manual_copy,slot_type,affiliate_url")
    .eq("id", offerId)
    .single();

  if (error || !offer) throw new Error(error?.message ?? "Oferta nao encontrada.");

  const slotType = String(offer.slot_type ?? "best").trim() || "best";
  const manualCopy = buildSiteManualCopyOverride(
    offer.manual_copy,
    slotType === "flash" || slotType === "comparator" ? slotType : "best",
    now,
  );

  const update = await supabaseAdmin
    .from("offers")
    .update({
      status: "active",
      curations_status: "approved",
      slot_type: slotType,
      affiliate_url: offer.affiliate_url ?? state.affiliate_url,
      published_at: now,
      expires_at: expiresAt,
      manual_copy: manualCopy,
      updated_at: now,
    })
    .eq("id", offerId);

  if (update.error) throw new Error(update.error.message);

  const distribution =
    channels.length > 0
      ? await dispatchLegacyOffer({
          offerId,
          affiliateUrl: String(offer.affiliate_url ?? state.affiliate_url ?? ""),
          channels,
          allowRequeueSameDay: true,
          scheduleNow: true,
        })
      : null;

  return { published: true, distribution };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = toText(body.action);
    const offerId = toText(body.offer_id);

    if (action === "evaluate") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const evaluation = await evaluateOffer(supabaseAdmin, offerId, { reason: "admin_manual" });
      return NextResponse.json({ success: true, evaluation });
    }

    if (action === "enqueue") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const jobId = await enqueueOpportunityEvaluation(supabaseAdmin, {
        offerId,
        reason: "admin_enqueue",
        dedupeKey: `manual:${Date.now()}`,
      });
      return NextResponse.json({ success: true, job_id: jobId });
    }

    if (action === "refresh_market_prices") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const jobId = await enqueueOpportunityEvaluation(supabaseAdmin, {
        offerId,
        reason: "admin_market_refresh",
        dedupeKey: `market:${Date.now()}`,
        forceMarketRefresh: true,
      });
      return NextResponse.json({ success: true, job_id: jobId });
    }

    if (action === "refresh_demand") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const jobId = await enqueueOpportunityEvaluation(supabaseAdmin, {
        offerId,
        reason: "admin_demand_refresh",
        dedupeKey: `demand:${Date.now()}`,
        forceDemandRefresh: true,
      });
      return NextResponse.json({ success: true, job_id: jobId });
    }

    if (action === "refresh_learning") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const jobId = await enqueueOpportunityEvaluation(supabaseAdmin, {
        offerId,
        reason: "admin_learning_refresh",
        dedupeKey: `learning:${Date.now()}`,
        forceLearningRefresh: true,
      });
      return NextResponse.json({ success: true, job_id: jobId });
    }

    if (action === "process_jobs") {
      const result = await processOpportunityEvaluationJobs(supabaseAdmin, {
        limit: toNumber(body.limit, 10),
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "publish_now") {
      if (!offerId) return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
      const result = await publishNow(offerId, normalizeChannels(body.channels));
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "publish_batch") {
      const offerIds = Array.isArray(body.offer_ids)
        ? Array.from(new Set(body.offer_ids.map((item) => toText(item)).filter(Boolean)))
        : [];
      if (!offerIds.length) {
        return NextResponse.json({ error: "offer_ids obrigatorio." }, { status: 400 });
      }

      const channels = normalizeChannels(body.channels);
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (const id of offerIds) {
        try {
          await publishNow(id, channels);
          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            error: error instanceof Error ? error.message : "Falha ao publicar.",
          });
        }
      }

      const approvedCount = results.filter((item) => item.ok).length;
      return NextResponse.json({
        success: true,
        approved_count: approvedCount,
        failed_count: results.length - approvedCount,
        results,
      });
    }

    return NextResponse.json({ error: "action invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao processar oportunidade." },
      { status: 500 },
    );
  }
}
