import type { SupabaseClient } from "@supabase/supabase-js";

export async function getHistoricalPriceAvg(
  client: SupabaseClient,
  offerId: string,
  days = 90,
): Promise<number | null> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("offer_price_history")
    .select("price")
    .eq("offer_id", offerId)
    .gte("captured_at", since);

  if (error || !data || data.length === 0) {
    return null;
  }

  const prices = data
    .map((row) => Number((row as { price: unknown }).price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return null;
  }

  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

/**
 * Quantos dias distintos ja tem registro de preco pra essa oferta — usado
 * pra so confiar na media historica depois de alguns dias reais de captura,
 * nao so 1-2 leituras.
 */
export async function countDistinctPriceHistoryDays(
  client: SupabaseClient,
  offerId: string,
  days = 90,
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("offer_price_history")
    .select("captured_at")
    .eq("offer_id", offerId)
    .gte("captured_at", since);

  if (error || !data) return 0;

  const distinctDays = new Set(
    data.map((row) => String((row as { captured_at: string }).captured_at).slice(0, 10)),
  );
  return distinctDays.size;
}

/**
 * Grava o preco de hoje no historico, no maximo 1x por dia por oferta (evita
 * duplicar quando o agente roda varias vezes no mesmo dia).
 */
export async function recordDailyPriceSnapshot(
  client: SupabaseClient,
  params: { offerId: string; price: number; originalPrice: number | null; source: string },
): Promise<void> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: existingToday } = await client
    .from("offer_price_history")
    .select("id")
    .eq("offer_id", params.offerId)
    .gte("captured_at", todayStart.toISOString())
    .limit(1)
    .maybeSingle();

  if (existingToday) return;

  await client.from("offer_price_history").insert({
    offer_id: params.offerId,
    price: params.price,
    original_price: params.originalPrice,
    currency: "BRL",
    source: params.source,
  });
}
