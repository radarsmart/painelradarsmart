import { searchViaMlSession } from "@/lib/scraping/ml-session-client";
import type {
  DemandProvider,
  DemandProviderMetric,
  DemandProviderSearchInput,
  DemandProviderSearchResult,
} from "@/lib/opportunity-engine/demand-providers";

const DIACRITIC_MARKS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_MARKS_PATTERN, "");
}

// Bandas logaritmicas: sold_count real devolvido pela busca do Mercado Livre
// vira score 0-100. Poucas vendas nao vira score alto so por existir alguma
// venda; sem nenhum match com dado de vendas o score fica indisponivel em
// vez de zero forcado (zero forcado pareceria "sem demanda alguma", quando
// na verdade e so "sem evidencia").
const SOLD_COUNT_BANDS: Array<{ min: number; score: number }> = [
  { min: 1000, score: 95 },
  { min: 500, score: 88 },
  { min: 200, score: 78 },
  { min: 100, score: 68 },
  { min: 50, score: 58 },
  { min: 20, score: 46 },
  { min: 5, score: 34 },
  { min: 1, score: 22 },
];

function scoreFromSoldCount(soldCount: number | null): number | null {
  if (soldCount === null || soldCount <= 0) return null;
  for (const band of SOLD_COUNT_BANDS) {
    if (soldCount >= band.min) return band.score;
  }
  return null;
}

export class MercadoLivrePopularityDemandProvider implements DemandProvider {
  readonly name = "mercadolivre-popularity";
  readonly type = "marketplace_popularity" as const;

  async search(input: DemandProviderSearchInput): Promise<DemandProviderSearchResult> {
    // A busca do Mercado Livre e correspondencia literal de catalogo, nao
    // interpretacao de intencao como uma busca do Google — pesquisar "produto
    // X cupom" ou "produto X vale a pena" contra o catalogo real devolve
    // resultados degradados ou vazios. Por isso so pesquisa UMA vez com a
    // query base (marca+modelo) e reaproveita o mesmo sinal real de vendas
    // para todas as variacoes de intencao, em vez de 7 chamadas desperdicadas.
    const baseQuery = input.queries.find((query) => query.intent === "base") ?? input.queries[0];
    if (!baseQuery) {
      return { provider: this.name, status: "empty", metrics: [] };
    }

    const brandToken = input.canonical_product.brand ? normalizeToken(input.canonical_product.brand) : null;
    const modelToken = input.canonical_product.model ? normalizeToken(input.canonical_product.model) : null;

    let bestSoldCount: number | null = null;
    let matchedCount = 0;

    try {
      const items = await searchViaMlSession(baseQuery.query, 10);
      const matches = items.filter((item) => {
        if (!item.title) return false;
        const title = normalizeToken(item.title);
        if (brandToken && !title.includes(brandToken)) return false;
        if (modelToken && !title.includes(modelToken)) return false;
        return true;
      });

      matchedCount = matches.length;
      bestSoldCount = matches.reduce<number | null>((best, item) => {
        if (item.sold_count === null || item.sold_count === undefined) return best;
        return best === null || item.sold_count > best ? item.sold_count : best;
      }, null);
    } catch (error) {
      return {
        provider: this.name,
        status: "error",
        metrics: [],
        error: error instanceof Error ? error.message : "Mercado Livre demand search falhou.",
      };
    }

    const popularityScore = scoreFromSoldCount(bestSoldCount);
    const capturedAt = new Date().toISOString();
    const rawPayload = { matched_count: matchedCount, best_sold_count: bestSoldCount, source_query: baseQuery.query };

    const metrics: DemandProviderMetric[] = input.queries.map((query) => ({
      provider_type: "marketplace_popularity",
      query: query.query,
      query_intent: query.intent,
      interest_score: null,
      search_demand_score: null,
      marketplace_popularity_score: popularityScore,
      social_score: null,
      trend_score: null,
      trend_velocity: null,
      purchase_intent_score: null,
      confidence: popularityScore !== null ? 55 : null,
      status: popularityScore !== null ? "available" : "unavailable",
      captured_at: capturedAt,
      raw_payload: rawPayload,
    }));

    return {
      provider: this.name,
      status: popularityScore !== null ? "success" : "empty",
      metrics,
    };
  }
}

export function isMercadoLivrePopularityDemandConfigured(): boolean {
  return Boolean(String(process.env.ML_SESSION_API_URL ?? "").trim());
}
