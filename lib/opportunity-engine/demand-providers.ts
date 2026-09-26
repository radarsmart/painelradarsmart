import type { DemandQuery, DemandQueryIntent } from "@/lib/opportunity-engine/demand-query-builder";
import {
  isMercadoLivrePopularityDemandConfigured,
  MercadoLivrePopularityDemandProvider,
} from "@/lib/opportunity-engine/mercadolivre-demand-provider";
import type { CanonicalProductDraft } from "@/lib/opportunity-engine/product-normalizer";
import { clamp, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type DemandProviderType =
  | "search_interest"
  | "shopping_search_demand"
  | "marketplace_popularity"
  | "social";

export type DemandProviderSearchInput = {
  queries: DemandQuery[];
  canonical_product: CanonicalProductDraft;
  timeout_ms: number;
};

export type DemandProviderMetric = {
  provider_type: DemandProviderType;
  query: string;
  query_intent: DemandQueryIntent;
  interest_score: number | null;
  search_demand_score: number | null;
  marketplace_popularity_score: number | null;
  social_score: number | null;
  trend_score: number | null;
  trend_velocity: number | null;
  purchase_intent_score: number | null;
  confidence: number | null;
  status: "available" | "unavailable" | "error";
  captured_at: string;
  raw_payload: unknown;
};

export type DemandProviderSearchResult = {
  provider: string;
  status: "success" | "empty" | "error";
  metrics: DemandProviderMetric[];
  error?: string;
  raw_response?: unknown;
};

export interface DemandProvider {
  readonly name: string;
  readonly type: DemandProviderType;
  search(input: DemandProviderSearchInput): Promise<DemandProviderSearchResult>;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function scoreOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(clamp(parsed, 0, 100));
}

function velocityOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed * 10) / 10;
}

function demandProviderType(value: unknown, fallback: DemandProviderType): DemandProviderType {
  const text = String(value ?? "").trim();
  if (
    text === "search_interest" ||
    text === "shopping_search_demand" ||
    text === "marketplace_popularity" ||
    text === "social"
  ) {
    return text;
  }
  return fallback;
}

function queryIntent(value: unknown, fallback: DemandQueryIntent): DemandQueryIntent {
  const text = String(value ?? "").trim();
  if (
    text === "base" ||
    text === "price" ||
    text === "promotion" ||
    text === "discount" ||
    text === "buy" ||
    text === "coupon" ||
    text === "review"
  ) {
    return text;
  }
  return fallback;
}

function mapMetric(
  item: Record<string, unknown>,
  providerType: DemandProviderType,
  queryFallback: DemandQuery,
): DemandProviderMetric {
  return {
    provider_type: demandProviderType(item.provider_type ?? item.type, providerType),
    query: toText(item.query) ?? queryFallback.query,
    query_intent: queryIntent(item.query_intent ?? item.intent, queryFallback.intent),
    interest_score: scoreOrNull(item.interest_score ?? item.interest),
    search_demand_score: scoreOrNull(item.search_demand_score ?? item.search_demand),
    marketplace_popularity_score: scoreOrNull(item.marketplace_popularity_score ?? item.marketplace_popularity),
    social_score: scoreOrNull(item.social_score ?? item.social),
    trend_score: scoreOrNull(item.trend_score ?? item.trend),
    trend_velocity: velocityOrNull(item.trend_velocity ?? item.velocity),
    purchase_intent_score: scoreOrNull(item.purchase_intent_score ?? item.purchase_intent),
    confidence: scoreOrNull(item.confidence),
    status: "available",
    captured_at: toText(item.captured_at) ?? new Date().toISOString(),
    raw_payload: item,
  };
}

export class ConfiguredHttpDemandProvider implements DemandProvider {
  readonly name: string;
  readonly type: DemandProviderType;
  private readonly endpoint: string;
  private readonly token: string | null;

  constructor(params: {
    endpoint: string;
    token?: string | null;
    name?: string;
    type?: DemandProviderType;
  }) {
    this.endpoint = params.endpoint;
    this.token = params.token ?? null;
    this.name = params.name ?? "demand-http";
    this.type = params.type ?? "search_interest";
  }

  async search(input: DemandProviderSearchInput): Promise<DemandProviderSearchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeout_ms);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          queries: input.queries,
          canonical_product: input.canonical_product,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          provider: this.name,
          status: "error",
          metrics: [],
          error: toText(payload.error) ?? `HTTP ${response.status}`,
          raw_response: payload,
        };
      }

      const rawMetrics = Array.isArray(payload.metrics)
        ? payload.metrics
        : Array.isArray(payload.results)
          ? payload.results
          : payload.metric && typeof payload.metric === "object"
            ? [payload.metric]
            : [];

      const metrics = rawMetrics
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item, index) => mapMetric(item, this.type, input.queries[index] ?? input.queries[0]));

      return {
        provider: this.name,
        status: metrics.length ? "success" : "empty",
        metrics,
        raw_response: payload,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "error",
        metrics: [],
        error: error instanceof Error ? error.message : "Provider de demanda falhou.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getConfiguredDemandProviders(): DemandProvider[] {
  const providers: DemandProvider[] = [];

  if (isMercadoLivrePopularityDemandConfigured()) {
    providers.push(new MercadoLivrePopularityDemandProvider());
  }

  const endpoint = String(process.env.DEMAND_INTELLIGENCE_PROVIDER_URL ?? "").trim();
  if (endpoint) {
    providers.push(
      new ConfiguredHttpDemandProvider({
        endpoint,
        token: String(process.env.DEMAND_INTELLIGENCE_PROVIDER_TOKEN ?? "").trim() || null,
        name: String(process.env.DEMAND_INTELLIGENCE_PROVIDER_NAME ?? "").trim() || "demand-http",
        type: demandProviderType(process.env.DEMAND_INTELLIGENCE_PROVIDER_TYPE, "search_interest"),
      }),
    );
  }

  return providers;
}
