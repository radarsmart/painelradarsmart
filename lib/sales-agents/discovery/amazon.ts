import { sanitizeAmazonUrl } from "@/lib/amazon";
import { supabaseAdmin } from "@/lib/supabase";
import type { SalesAgent, DiscoveryCandidate } from "../types";

type HubOfferRow = {
  external_offer_id: string;
  title: string;
  price: number;
  old_price: number | null;
  discount_pct: number | null;
  image_url: string | null;
  product_url: string;
  classification: string | null;
};

const DEFAULT_AMAZON_TAG = "radarsmart202-20";

export async function discoverAmazon(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  let query = supabaseAdmin
    .from("hub_offers")
    .select("external_offer_id,title,price,old_price,discount_pct,image_url,product_url,classification")
    .eq("marketplace", "amazon")
    .eq("status", "active");

  const search = agent.searchQuery || agent.category;
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }
  if (typeof agent.priceMin === "number") {
    query = query.gte("price", agent.priceMin);
  }
  if (typeof agent.priceMax === "number") {
    query = query.lte("price", agent.priceMax);
  }
  if (agent.minDiscountPct > 0) {
    query = query.gte("discount_pct", agent.minDiscountPct);
  }

  const { data, error } = await query.order("synced_at", { ascending: false }).limit(60);

  if (error) {
    throw new Error(`Falha ao buscar ofertas Amazon (hub_offers): ${error.message}`);
  }

  const rows = (data ?? []) as HubOfferRow[];
  const amazonTag =
    process.env.AMAZON_TRACKING_ID || process.env.AMAZON_AFFILIATE_TAG || DEFAULT_AMAZON_TAG;

  return rows
    .filter((row) => row.external_offer_id && row.title && row.price > 0 && row.product_url)
    .map((row) => ({
      externalId: `amazon:${row.external_offer_id}`,
      title: row.title,
      price: row.price,
      oldPrice: row.old_price && row.old_price > row.price ? row.old_price : null,
      discountPct: row.discount_pct || null,
      imageUrl: row.image_url,
      affiliateUrl: sanitizeAmazonUrl(row.product_url, amazonTag),
      productUrl: row.product_url,
      category: agent.category || null,
      rating: null,
      reviewCount: null,
      commissionRatePct: null,
      badges: row.classification ? [row.classification] : [],
      raw: row,
      affiliateLinkVerified: true,
    }));
}
