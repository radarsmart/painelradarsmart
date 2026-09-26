import { AmazonMarketSearchProvider } from "@/lib/opportunity-engine/amazon-market-provider";
import { isMercadoLivreMarketSearchConfigured, MercadoLivreMarketSearchProvider } from "@/lib/opportunity-engine/mercadolivre-market-provider";
import type { CanonicalProductDraft } from "@/lib/opportunity-engine/product-normalizer";
import type { ProductSearchQuery } from "@/lib/opportunity-engine/product-search-query-builder";
import { isShopeeMarketSearchConfigured, ShopeeMarketSearchProvider } from "@/lib/opportunity-engine/shopee-market-provider";
import { toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type ExternalSearchStatus = "available" | "unavailable" | "error";

export type ExternalProductEvidence = {
  source: string;
  captured_at: string;
  canonical_product: Partial<CanonicalProductDraft>;
  raw_payload: unknown;
};

export type ExternalProductSearchResult = {
  external_search_status: ExternalSearchStatus;
  evidence: ExternalProductEvidence[];
  error?: string;
};

export interface ExternalProductSearchProvider {
  readonly name: string;
  search(product: CanonicalProductDraft): Promise<ExternalProductSearchResult>;
}

export async function runExternalProductSearch(
  product: CanonicalProductDraft,
  providers: ExternalProductSearchProvider[] = [],
): Promise<ExternalProductSearchResult> {
  if (!providers.length) {
    return { external_search_status: "unavailable", evidence: [] };
  }

  const evidence: ExternalProductEvidence[] = [];
  for (const provider of providers) {
    try {
      const result = await provider.search(product);
      evidence.push(...result.evidence);
    } catch (error) {
      return {
        external_search_status: "error",
        evidence,
        error: error instanceof Error ? error.message : "External provider failed.",
      };
    }
  }

  return {
    external_search_status: evidence.length > 0 ? "available" : "unavailable",
    evidence,
  };
}

export type SignalScoreResult = {
  score: number | null;
  source: string;
  status: "available" | "unavailable";
  reasons: string[];
  warnings: string[];
};

export interface TrendSignalProvider {
  readonly name: string;
  score(product: CanonicalProductDraft): Promise<SignalScoreResult>;
}

export interface PurchaseIntentProvider {
  readonly name: string;
  score(product: CanonicalProductDraft): Promise<SignalScoreResult>;
}

export function unavailableSignal(source: string): SignalScoreResult {
  return {
    score: null,
    source,
    status: "unavailable",
    reasons: [],
    warnings: ["Fonte nao configurada."],
  };
}

export type ExternalMarketSearchInput = {
  query: ProductSearchQuery;
  canonical_product: CanonicalProductDraft;
  timeout_ms: number;
};

export type ExternalMarketResultItem = {
  source: string;
  marketplace: string | null;
  seller: string | null;
  external_product_id: string | null;
  title: string;
  url: string | null;
  image_url: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  price: number | null;
  regular_price: number | null;
  pix_price: number | null;
  card_price: number | null;
  installments: number | null;
  installment_count: number | null;
  installment_value: number | null;
  installment_amount: number | null;
  interest_free: boolean | null;
  installment_interest_free: boolean | null;
  shipping_cost: number | null;
  currency: string | null;
  payment_information_original: string | null;
  captured_at: string;
  raw_payload: unknown;
};

export type ExternalMarketProviderSearchResult = {
  provider: string;
  status: "success" | "empty" | "error";
  results: ExternalMarketResultItem[];
  error?: string;
  raw_response?: unknown;
};

export interface ExternalMarketSearchProvider {
  readonly name: string;
  search(input: ExternalMarketSearchInput): Promise<ExternalMarketProviderSearchResult>;
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "sim", "sem juros", "interest_free"].includes(text)) return true;
  if (["false", "0", "nao", "não", "com juros"].includes(text)) return false;
  return null;
}

function mapExternalMarketItem(item: Record<string, unknown>, providerName: string): ExternalMarketResultItem | null {
  const title = textOrNull(item.title ?? item.name ?? item.product_title);
  if (!title) return null;

  return {
    source: textOrNull(item.source) ?? providerName,
    marketplace: textOrNull(item.marketplace ?? item.store ?? item.channel),
    seller: textOrNull(item.seller ?? item.seller_name ?? item.merchant),
    external_product_id: textOrNull(item.external_product_id ?? item.product_id ?? item.id),
    title,
    url: textOrNull(item.url ?? item.product_url ?? item.link),
    image_url: textOrNull(item.image_url ?? item.image ?? item.thumbnail),
    brand: textOrNull(item.brand),
    model: textOrNull(item.model),
    category: textOrNull(item.category),
    price: toNullableNumber(item.price),
    regular_price: toNullableNumber(item.regular_price ?? item.price),
    pix_price: toNullableNumber(item.pix_price ?? item.cash_price),
    card_price: toNullableNumber(item.card_price),
    installments: toNullableNumber(item.installments ?? item.installment_count),
    installment_count: toNullableNumber(item.installment_count ?? item.installments),
    installment_value: toNullableNumber(item.installment_value ?? item.installment_amount),
    installment_amount: toNullableNumber(item.installment_amount ?? item.installment_value),
    interest_free: boolOrNull(item.interest_free ?? item.installment_interest_free),
    installment_interest_free: boolOrNull(item.installment_interest_free ?? item.interest_free),
    shipping_cost: toNullableNumber(item.shipping_cost ?? item.freight ?? item.shipping),
    currency: textOrNull(item.currency) ?? "BRL",
    payment_information_original: textOrNull(item.payment_information_original ?? item.payment_summary),
    captured_at: textOrNull(item.captured_at) ?? new Date().toISOString(),
    raw_payload: item,
  };
}

export class ConfiguredHttpMarketSearchProvider implements ExternalMarketSearchProvider {
  readonly name: string;
  private readonly endpoint: string;
  private readonly token: string | null;

  constructor(params: { name?: string; endpoint: string; token?: string | null }) {
    this.name = params.name ?? "configured-http-market-search";
    this.endpoint = params.endpoint;
    this.token = params.token ?? null;
  }

  async search(input: ExternalMarketSearchInput): Promise<ExternalMarketProviderSearchResult> {
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
          query: input.query.query,
          strategy: input.query.strategy,
          identifiers: input.query.identifiers,
          canonical_product: input.canonical_product,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          provider: this.name,
          status: "error",
          results: [],
          error: textOrNull(payload.error) ?? `HTTP ${response.status}`,
          raw_response: payload,
        };
      }

      const rawResults = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.items)
          ? payload.items
          : [];
      const results = rawResults
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => mapExternalMarketItem(item, this.name))
        .filter((item): item is ExternalMarketResultItem => Boolean(item));

      return {
        provider: this.name,
        status: results.length ? "success" : "empty",
        results,
        raw_response: payload,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "error",
        results: [],
        error: error instanceof Error ? error.message : "Provider externo falhou.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getConfiguredMarketSearchProviders(): ExternalMarketSearchProvider[] {
  const providers: ExternalMarketSearchProvider[] = [];

  if (isMercadoLivreMarketSearchConfigured()) {
    providers.push(new MercadoLivreMarketSearchProvider());
  }
  if (isShopeeMarketSearchConfigured()) {
    providers.push(new ShopeeMarketSearchProvider());
  }
  // Busca ao vivo no site (sem API oficial, mesmo formato do Mercado Livre e
  // sem depender de Apify/Rainforest) — sempre disponivel, ja tem tag de
  // afiliado padrao mesmo sem env var configurada.
  providers.push(new AmazonMarketSearchProvider());

  const endpoint = String(process.env.EXTERNAL_MARKET_SEARCH_PROVIDER_URL ?? "").trim();
  if (endpoint) {
    providers.push(
      new ConfiguredHttpMarketSearchProvider({
        endpoint,
        token: String(process.env.EXTERNAL_MARKET_SEARCH_PROVIDER_TOKEN ?? "").trim() || null,
        name: String(process.env.EXTERNAL_MARKET_SEARCH_PROVIDER_NAME ?? "").trim() || "market-search-http",
      }),
    );
  }

  return providers;
}
