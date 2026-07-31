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
