import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import {
  countDistinctPriceHistoryDays,
  getHistoricalPriceAvg,
  recordDailyPriceSnapshot,
} from "@/lib/offers/price-history";
import type { DiscoveryCandidate, SalesAgent } from "./types";

// Fontes cujo feed nao expoe desconto/avaliacao/comissao real por produto
// (ex.: a maioria dos anunciantes da AWIN, ao contrario da Shopee ou do
// Mercado Livre) precisam de rastreamento de preco proprio pra saber se um
// preco atual e realmente uma queda, em vez de confiar em dado que nao existe.
const MIN_HISTORY_DAYS = 3;
const MIN_TRACKED_DISCOUNT_PCT = 15;

function getMissingColumnFromError(message: string): string | null {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column "([^"]+)" of relation/i)?.[1] ||
    null
  );
}

async function findOrCreateTrackedOffer(
  agent: SalesAgent,
  candidate: DiscoveryCandidate,
): Promise<string> {
  const { data: existing, error: findError } = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq("product_url", candidate.productUrl)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Falha ao buscar oferta monitorada: ${findError.message}`);
  }
  if (existing) return String((existing as { id: string }).id);

  // Cria uma oferta "em observacao" — nao publicada em lugar nenhum ainda,
  // so existe pra ter um offer_id valido onde acumular offer_price_history.
  const payload: Record<string, unknown> = {
    external_offer_id: candidate.externalId,
    title: candidate.title,
    price: candidate.price,
    image_url: candidate.imageUrl,
    product_url: candidate.productUrl,
    affiliate_url: candidate.affiliateUrl,
    marketplace: agent.source,
    category: candidate.category,
    status: "inactive",
    curations_status: "monitoring",
    source: `sales_agent:${agent.id}`,
    currency: "BRL",
  };

  let saveResult = await salvarOferta(payload);
  while (saveResult.error) {
    const missingColumn = getMissingColumnFromError(saveResult.error.message);
    if (!missingColumn || !(missingColumn in payload)) break;
    delete payload[missingColumn];
    saveResult = await salvarOferta(payload);
  }

  if (saveResult.error || !saveResult.data) {
    throw new Error(saveResult.error?.message ?? "Falha ao criar oferta em observacao.");
  }

  return String((saveResult.data as { id: string }).id);
}

export type PriceTrackingResult = {
  offerId: string;
  discountPct: number | null;
  avgPrice: number | null;
  ready: boolean;
};

/**
 * Pra candidatos sem desconto nativo da API: acha ou cria uma oferta "em
 * observacao", grava o preco de hoje, e so retorna um desconto calculado
 * quando ja houver alguns dias de historico real — antes disso, "ready" fica
 * false e o candidato nao deve ser publicado ainda (so estamos aprendendo o
 * preco normal do produto).
 */
export async function trackAndComputeDiscount(
  agent: SalesAgent,
  candidate: DiscoveryCandidate,
): Promise<PriceTrackingResult> {
  const offerId = await findOrCreateTrackedOffer(agent, candidate);

  await recordDailyPriceSnapshot(supabaseAdmin, {
    offerId,
    price: candidate.price,
    originalPrice: candidate.oldPrice,
    source: agent.source,
  });

  const historyDays = await countDistinctPriceHistoryDays(supabaseAdmin, offerId);
  if (historyDays < MIN_HISTORY_DAYS) {
    return { offerId, discountPct: null, avgPrice: null, ready: false };
  }

  const avgPrice = await getHistoricalPriceAvg(supabaseAdmin, offerId);
  if (avgPrice === null || avgPrice <= candidate.price) {
    return { offerId, discountPct: null, avgPrice, ready: false };
  }

  const discountPct = Math.round(((avgPrice - candidate.price) / avgPrice) * 100);
  return {
    offerId,
    discountPct,
    avgPrice,
    ready: discountPct >= MIN_TRACKED_DISCOUNT_PCT,
  };
}
