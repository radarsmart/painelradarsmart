import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Flame,
  LineChart,
  Search,
  ShoppingCart,
} from "lucide-react";

import OpportunityActions from "@/components/admin/OpportunityActions";
import OpportunityBulkActions from "@/components/admin/OpportunityBulkActions";
import OpportunityProcessQueueButton from "@/components/admin/OpportunityProcessQueueButton";
import { buildOfferPresentation } from "@/lib/offers/pricing";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type OpportunityRow = {
  offer_id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  image_url: string | null;
  regular_price: number | string | null;
  pix_price: number | string | null;
  card_price: number | string | null;
  effective_price: number | string | null;
  shipping_cost: number | string | null;
  installment_count: number | string | null;
  installment_amount: number | string | null;
  installment_interest_free: boolean | null;
  market_lowest_price: number | string | null;
  market_lowest_pix_price: number | string | null;
  market_lowest_card_price: number | string | null;
  market_lowest_effective_price: number | string | null;
  market_average_price: number | string | null;
  market_median_price: number | string | null;
  marketplace_count: number | null;
  market_valid_offer_count: number | null;
  market_outlier_count: number | null;
  market_confidence_score: number | null;
  market_evidence: unknown;
  market_search_status: string | null;
  market_search_query: string | null;
  market_search_cached: boolean | null;
  comparison_confidence: string | null;
  marketplace_discount: number | string | null;
  radar_real_discount: number | string | null;
  trend_score: number | null;
  trend_velocity: number | string | null;
  purchase_intent_score: number | null;
  demand_confidence_score: number | null;
  demand_provider_count: number | null;
  demand_snapshot_count: number | null;
  demand_status: string | null;
  demand_query: string | null;
  demand_cached: boolean | null;
  demand_snapshots: unknown;
  payment_attractiveness_score: number | null;
  internal_performance_score: number | null;
  internal_performance_confidence: number | null;
  internal_performance_base: unknown;
  historical_segment_score: number | null;
  historical_segment_confidence: number | null;
  performance_segment_key: string | null;
  performance_status: string | null;
  match_score: number | null;
  match_status: string | null;
  opportunity_score: number | null;
  opportunity_confidence: number | null;
  data_completeness_score: number | null;
  classification: string | null;
  publishing_gate_status: string | null;
  reasons: unknown;
  warnings: unknown;
  blocking_reasons: unknown;
  score_components: unknown;
  evaluated_at: string | null;
};

type MarketEvidenceItem = {
  id: string;
  marketplace: string | null;
  source: string | null;
  seller: string | null;
  title: string | null;
  url: string | null;
  regular_price: number | string | null;
  pix_price: number | string | null;
  card_price: number | string | null;
  effective_price: number | string | null;
  match_score: number | null;
  match_status: string | null;
  included_in_comparison: boolean | null;
  excluded_reason: string | null;
  is_price_outlier: boolean | null;
};

const PAGE_SIZE = 25;

function pick(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: unknown): string {
  const number = toNumber(value);
  if (number === null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function formatPercent(value: unknown): string {
  const number = toNumber(value);
  return number === null ? "-" : `${number.toFixed(1)}%`;
}

function formatAge(value: string | null): string {
  if (!value) return "-";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "-";
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 6) : [];
}

function asMarketEvidence(value: unknown): MarketEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? `${item.source ?? "source"}-${item.url ?? item.title ?? ""}`),
      marketplace: item.marketplace ? String(item.marketplace) : null,
      source: item.source ? String(item.source) : null,
      seller: item.seller ? String(item.seller) : null,
      title: item.title ? String(item.title) : null,
      url: item.url ? String(item.url) : null,
      regular_price: (item.regular_price as number | string | null | undefined) ?? null,
      pix_price: (item.pix_price as number | string | null | undefined) ?? null,
      card_price: (item.card_price as number | string | null | undefined) ?? null,
      effective_price: (item.effective_price as number | string | null | undefined) ?? null,
      match_score: toNumber(item.match_score),
      match_status: item.match_status ? String(item.match_status) : null,
      included_in_comparison: typeof item.included_in_comparison === "boolean" ? item.included_in_comparison : null,
      excluded_reason: item.excluded_reason ? String(item.excluded_reason) : null,
      is_price_outlier: typeof item.is_price_outlier === "boolean" ? item.is_price_outlier : null,
    }))
    .slice(0, 8);
}

function marketDifference(row: OpportunityRow): string {
  const median = toNumber(row.market_median_price);
  const effective = toNumber(row.effective_price);
  if (!median || !effective) return "-";
  const diff = ((median - effective) / median) * 100;
  return `${Math.abs(diff).toFixed(1)}% ${diff >= 0 ? "abaixo" : "acima"} da mediana`;
}

function demandBadges(row: OpportunityRow): string[] {
  const badges: string[] = [];
  const trend = row.trend_score ?? 0;
  const velocity = toNumber(row.trend_velocity) ?? 0;
  const intent = row.purchase_intent_score ?? 0;
  const marketConfidence = row.market_confidence_score ?? 0;
  const demandConfidence = row.demand_confidence_score ?? 0;

  if (trend >= 80) badges.push("Em alta");
  if (velocity >= 25) badges.push("Crescendo rapido");
  if (intent >= 85) badges.push("Forte intencao de compra");
  if (velocity <= -15) badges.push("Perdendo forca");
  if (marketConfidence >= 70 && demandConfidence >= 70 && intent >= 75) {
    badges.push("Melhor preco + alta demanda");
  }

  return badges;
}

function performanceBase(value: unknown): {
  impressions: number | null;
  clicks: number | null;
  affiliate_clicks: number | null;
  orders: number | null;
  commission: number | null;
  ctr: number | null;
  conversion_rate: number | null;
} {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    affiliate_clicks: toNumber(row.affiliate_clicks),
    orders: toNumber(row.orders),
    commission: toNumber(row.commission),
    ctr: toNumber(row.ctr),
    conversion_rate: toNumber(row.conversion_rate),
  };
}

function statusTone(value: string | null | undefined): string {
  if (value === "PUBLISH_NOW" || value === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (value === "HIGH_PRIORITY" || value === "PUBLISH") return "bg-amber-50 text-amber-700";
  if (value === "BLOCKED" || value === "REJECT") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function buildQuery(params: SearchParams, updates: Record<string, string | number | null>) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, String(value));
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") query.delete(key);
    else query.set(key, String(value));
  }
  return `?${query.toString()}`;
}

async function loadAlreadySentOfferIds(): Promise<string[]> {
  // post_queue.status='sent' e o unico sinal confiavel de "ja foi pro grupo"
  // hoje (offers.post_count/last_posted_at nunca sao preenchidos por nenhum
  // worker) — sem isso, reavaliar o catalogo inteiro faz oferta ja enviada
  // reaparecer no radar como se fosse nova, confundindo a curadoria manual.
  const { data } = await supabaseAdmin
    .from("post_queue")
    .select("offer_id")
    .eq("status", "sent")
    .not("offer_id", "is", null)
    .limit(20000);

  return Array.from(new Set((data ?? []).map((row) => String((row as { offer_id: string }).offer_id))));
}

async function loadRows(searchParams: SearchParams) {
  const page = Math.max(1, Number(pick(searchParams, "page")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const sort = pick(searchParams, "sort") || "opportunity_score";
  const direction = pick(searchParams, "direction") === "asc" ? "asc" : "desc";
  const showSent = pick(searchParams, "sent") === "show";

  let query = supabaseAdmin
    .from("opportunity_current_state")
    .select("*", { count: "exact" });

  let hiddenSentCount = 0;
  if (!showSent) {
    const sentIds = await loadAlreadySentOfferIds();
    hiddenSentCount = sentIds.length;
    if (sentIds.length) query = query.not("offer_id", "in", `(${sentIds.join(",")})`);
  }

  const classification = pick(searchParams, "classification");
  const gate = pick(searchParams, "gate");
  const marketplace = pick(searchParams, "marketplace");
  const minScore = Number(pick(searchParams, "min_score"));
  const minConfidence = Number(pick(searchParams, "min_confidence"));
  const minMatch = Number(pick(searchParams, "min_match"));
  const minRealDiscount = Number(pick(searchParams, "min_real_discount"));

  if (classification) query = query.eq("classification", classification);
  if (gate) query = query.eq("publishing_gate_status", gate);
  if (marketplace) query = query.ilike("marketplace", `%${marketplace}%`);
  if (Number.isFinite(minScore) && minScore > 0) query = query.gte("opportunity_score", minScore);
  if (Number.isFinite(minConfidence) && minConfidence > 0) query = query.gte("opportunity_confidence", minConfidence);
  if (Number.isFinite(minMatch) && minMatch > 0) query = query.gte("match_score", minMatch);
  if (Number.isFinite(minRealDiscount) && minRealDiscount > 0) query = query.gte("radar_real_discount", minRealDiscount);
  if (pick(searchParams, "with_pix") === "true") query = query.not("pix_price", "is", null);
  if (pick(searchParams, "with_installments") === "true") query = query.not("installment_count", "is", null);

  const sortable = new Set([
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
    "internal_performance_score",
    "internal_performance_confidence",
  ]);
  const { data, count } = await query
    .order(sortable.has(sort) ? sort : "opportunity_score", {
      ascending: direction === "asc",
      nullsFirst: false,
    })
    .range(from, to);

  return {
    rows: (data ?? []) as OpportunityRow[],
    count: count ?? 0,
    page,
    hiddenSentCount,
    showSent,
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof Flame;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-black text-navy">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default async function RadarOportunidadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const { rows, count, page, hiddenSentCount, showSent } = await loadRows(searchParams);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const stats = {
    publishNow: rows.filter((row) => row.classification === "PUBLISH_NOW").length,
    marketReady: rows.filter((row) => (row.market_valid_offer_count ?? 0) >= 2).length,
    bestPrice: rows.filter((row) => (toNumber(row.radar_real_discount) ?? 0) >= 10).length,
    demandReady: rows.filter((row) => (row.demand_confidence_score ?? 0) >= 70).length,
    fastGrowing: rows.filter((row) => (toNumber(row.trend_velocity) ?? 0) >= 25).length,
    review: rows.filter((row) => row.publishing_gate_status === "REVIEW_REQUIRED").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Radar de Oportunidades</h1>
          <p className="mt-1 text-sm text-rs-muted">
            Score, confidence, pagamento, matching e bloqueios de publicacao.
          </p>
        </div>
        <OpportunityProcessQueueButton />
      </div>

      {!showSent && hiddenSentCount > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {hiddenSentCount} oferta(s) já enviada(s) para grupos está(ão) oculta(s).{" "}
          <Link href={buildQuery(searchParams, { sent: "show" })} className="font-semibold text-[#9e6a18]">
            Mostrar todas
          </Link>
        </div>
      ) : null}
      {showSent ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Mostrando também ofertas já enviadas para grupos.{" "}
          <Link href={buildQuery(searchParams, { sent: null })} className="font-semibold text-[#9e6a18]">
            Ocultar enviadas
          </Link>
        </div>
      ) : null}

      <OpportunityBulkActions />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Publicar agora" value={stats.publishNow} icon={Flame} tone="bg-emerald-50 text-emerald-700" />
        <StatCard title="Mercado real" value={stats.marketReady} icon={LineChart} tone="bg-blue-50 text-blue-700" />
        <StatCard title="Melhor preco" value={stats.bestPrice} icon={BadgeCheck} tone="bg-amber-50 text-amber-700" />
        <StatCard title="Demanda real" value={stats.demandReady} icon={ShoppingCart} tone="bg-violet-50 text-violet-700" />
        <StatCard title="Crescendo" value={stats.fastGrowing} icon={Ban} tone="bg-cyan-50 text-cyan-700" />
        <StatCard title="Revisao" value={stats.review} icon={AlertTriangle} tone="bg-orange-50 text-orange-700" />
      </div>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <label className="text-xs font-semibold text-slate-600">
          Status
          <select name="classification" defaultValue={pick(searchParams, "classification")} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm">
            <option value="">Todos</option>
            {["PUBLISH_NOW", "HIGH_PRIORITY", "PUBLISH", "WATCH", "LOW_PRIORITY", "REJECT"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Gate
          <select name="gate" defaultValue={pick(searchParams, "gate")} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm">
            <option value="">Todos</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Marketplace
          <input name="marketplace" defaultValue={pick(searchParams, "marketplace")} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Score min.
          <input name="min_score" defaultValue={pick(searchParams, "min_score")} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Confidence min.
          <input name="min_confidence" defaultValue={pick(searchParams, "min_confidence")} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm" />
        </label>
        <div className="flex items-end">
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 text-sm font-semibold text-white" type="submit">
            <Search className="h-4 w-4" />
            Filtrar
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Marketplace</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Mercado</th>
                <th className="px-4 py-3">Demanda</th>
                <th className="px-4 py-3">Audiencia</th>
                <th className="px-4 py-3">Desconto real</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ultima</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const presentation = buildOfferPresentation({
                  regular_price: row.regular_price,
                  price: row.regular_price,
                  pix_price: row.pix_price,
                  card_price: row.card_price,
                  shipping_cost: row.shipping_cost,
                  installment_count: row.installment_count,
                  installment_amount: row.installment_amount,
                  installment_interest_free: row.installment_interest_free,
                  radar_real_discount_pct: row.radar_real_discount,
                });
                const reasons = asList(row.reasons);
                const warnings = asList(row.warnings);
                const blocks = asList(row.blocking_reasons);
                const evidence = asMarketEvidence(row.market_evidence);
                const badges = demandBadges(row);
                const audienceBase = performanceBase(row.internal_performance_base);

                return (
                  <tr key={row.offer_id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <p className="line-clamp-2 max-w-[260px] font-semibold text-navy">{row.title ?? "Oferta"}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.category ?? "-"}</p>
                      <details className="mt-2 text-xs text-slate-600">
                        <summary className="cursor-pointer font-semibold text-[#9e6a18]">Detalhes</summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <p className="font-semibold text-slate-800">Motivos</p>
                            {reasons.length ? reasons.map((item) => <p key={item}>+ {item}</p>) : <p>-</p>}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Avisos</p>
                            {warnings.length ? warnings.map((item) => <p key={item}>- {item}</p>) : <p>-</p>}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Bloqueios</p>
                            {blocks.length ? blocks.map((item) => <p key={item}>- {item}</p>) : <p>nenhum</p>}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Mercado externo</p>
                            {evidence.length ? evidence.map((item) => (
                              <div key={item.id} className="border-t border-slate-100 pt-2">
                                <p className="font-semibold text-slate-700">
                                  {item.marketplace ?? item.source ?? "Fonte"} - {formatMoney(item.effective_price)}
                                </p>
                                <p className="line-clamp-2">{item.title ?? "-"}</p>
                                <p>
                                  Match: {item.match_score ?? 0}% - {item.included_in_comparison ? "comparado" : item.excluded_reason ?? "excluido"}
                                </p>
                                {item.url ? (
                                  <Link className="font-semibold text-[#9e6a18]" href={item.url} target="_blank" rel="noreferrer">
                                    abrir evidencia
                                  </Link>
                                ) : null}
                              </div>
                            )) : <p>sem evidencia externa</p>}
                          </div>
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3">{row.marketplace ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-emerald-700">{presentation.headline_price ?? formatMoney(row.effective_price)}</p>
                      {presentation.secondary_price ? <p className="text-xs text-slate-500">{presentation.secondary_price}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>PIX: <span className="font-semibold">{formatMoney(row.market_lowest_pix_price)}</span></p>
                      <p>Cartao: <span className="font-semibold">{formatMoney(row.market_lowest_card_price)}</span></p>
                      <p>Efetivo: <span className="font-semibold">{formatMoney(row.market_lowest_effective_price ?? row.market_lowest_price)}</span></p>
                      <p>Media: <span className="font-semibold">{formatMoney(row.market_average_price)}</span></p>
                      <p>Mediana: <span className="font-semibold">{formatMoney(row.market_median_price)}</span></p>
                      <p>{marketDifference(row)}</p>
                      <p>{row.market_valid_offer_count ?? 0} ofertas - {row.marketplace_count ?? 0} lojas</p>
                      <p>Market Confidence: {row.market_confidence_score ?? 0}/100</p>
                      <p>{row.market_search_status ?? "unavailable"}{row.market_search_cached ? " - cache" : ""}</p>
                      {row.market_search_query ? <p className="line-clamp-1">Query: {row.market_search_query}</p> : null}
                      <p>{row.marketplace_count ?? 0} lojas · {row.comparison_confidence ?? "unavailable"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>Trend: <span className="font-semibold">{row.trend_score ?? "-"}</span></p>
                      <p>Velocity: <span className="font-semibold">{formatPercent(row.trend_velocity)}</span></p>
                      <p>Intent: <span className="font-semibold">{row.purchase_intent_score ?? "-"}</span></p>
                      <p>Demand Confidence: {row.demand_confidence_score ?? 0}/100</p>
                      <p>{row.demand_status ?? "unavailable"}{row.demand_cached ? " - cache" : ""}</p>
                      {row.demand_query ? <p className="line-clamp-1">Query: {row.demand_query}</p> : null}
                      {badges.length ? (
                        <div className="mt-2 flex max-w-[190px] flex-wrap gap-1">
                          {badges.map((badge) => (
                            <span key={badge} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                              {badge}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>Performance: <span className="font-semibold">{row.internal_performance_score ?? "-"}</span></p>
                      <p>Confidence: {row.internal_performance_confidence ?? 0}/100</p>
                      <p>Segmento: <span className="font-semibold">{row.historical_segment_score ?? "-"}</span></p>
                      <p>Segment Confidence: {row.historical_segment_confidence ?? 0}/100</p>
                      <p>{row.performance_status ?? "unavailable"}</p>
                      <p>Base: {audienceBase.impressions ?? 0} imp. / {audienceBase.affiliate_clicks ?? audienceBase.clicks ?? 0} cliques / {audienceBase.orders ?? 0} vendas</p>
                      {audienceBase.ctr !== null ? <p>CTR: {formatPercent(audienceBase.ctr)}</p> : null}
                      {audienceBase.conversion_rate !== null ? <p>Conv.: {formatPercent(audienceBase.conversion_rate)}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatPercent(row.radar_real_discount)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.match_score ?? 0}%</p>
                      <p className="text-xs text-slate-500">{row.match_status ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-lg font-black text-navy">{row.opportunity_score ?? 0}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusTone(row.classification)}`}>
                        {row.classification ?? "WATCH"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.opportunity_confidence ?? 0}/100</p>
                      <p className="text-xs text-slate-500">dados {row.data_completeness_score ?? 0}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusTone(row.publishing_gate_status)}`}>
                        {row.publishing_gate_status ?? "REVIEW_REQUIRED"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatAge(row.evaluated_at)}</td>
                    <td className="px-4 py-3">
                      <OpportunityActions offerId={row.offer_id} gateStatus={row.publishing_gate_status ?? ""} />
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={13}>
                    Nenhuma oportunidade avaliada ainda. Processe a fila ou reavalie uma oferta.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Pagina {page} de {totalPages} · {count} oportunidades
        </p>
        <div className="flex gap-2">
          <Link
            href={buildQuery(searchParams, { page: Math.max(1, page - 1) })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold"
          >
            Anterior
          </Link>
          <Link
            href={buildQuery(searchParams, { page: Math.min(totalPages, page + 1) })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold"
          >
            Proxima
          </Link>
        </div>
      </div>
    </div>
  );
}
