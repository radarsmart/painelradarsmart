import { fetchAwinAdvertiserFeedProducts } from "@/lib/awin/client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

const DEFAULT_ADVERTISER_ID = "18879";

export async function discoverAwin(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const result = await fetchAwinAdvertiserFeedProducts({
    advertiserId: agent.advertiserId || DEFAULT_ADVERTISER_ID,
    search: agent.searchQuery || undefined,
    category: agent.category || undefined,
    sort: "best_deals",
    page: 1,
    priceMin: agent.priceMin,
    priceMax: agent.priceMax,
  });

  return result.products.map((product) => ({
    externalId: `awin:${agent.advertiserId || DEFAULT_ADVERTISER_ID}:${product.id || product.awDeepLink}`,
    title: product.productName,
    price: product.searchPrice,
    oldPrice: null,
    discountPct: null,
    imageUrl: product.merchantImageUrl || null,
    affiliateUrl: product.awDeepLink,
    productUrl: product.merchantDeepLink || product.awDeepLink,
    category: product.categoryName || null,
    rating: Number.isFinite(product.rating) ? product.rating : null,
    reviewCount: null,
    commissionRatePct: null,
    badges: product.isFreeShipping ? ["frete gratis"] : [],
    raw: product,
    affiliateLinkVerified: true,
  }));
}
