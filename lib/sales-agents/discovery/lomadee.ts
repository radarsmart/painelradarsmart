import { fetchLomadeeProducts, shortenLomadeeUrl } from "@/lib/lomadee/client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

export async function discoverLomadee(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const result = await fetchLomadeeProducts({
    search: agent.searchQuery || agent.category || undefined,
    page: 1,
    limit: 20,
    priceMin: agent.priceMin ?? undefined,
    priceMax: agent.priceMax ?? undefined,
    sort: "discount",
    organizationIds: agent.advertiserId || undefined,
    isAvailable: true,
  });

  const candidates: DiscoveryCandidate[] = [];

  for (const product of result.products) {
    if (!product.available || !product.link) continue;

    let affiliateUrl = product.link;
    let affiliateLinkVerified = false;
    try {
      affiliateUrl = await shortenLomadeeUrl({
        url: product.link,
        organizationId: product.organizationId,
        mdasc: product.id ? `radar-smart-${product.id}` : "radar-smart",
      });
      affiliateLinkVerified = true;
    } catch {
      // Se o encurtador falhar, cai no link original do produto (sem rastreamento).
    }

    candidates.push({
      externalId: `lomadee:${product.organizationId}:${product.id}`,
      title: product.title,
      price: product.price,
      oldPrice: product.original_price > product.price ? product.original_price : null,
      discountPct: product.discount_pct || null,
      imageUrl: product.image || null,
      affiliateUrl,
      productUrl: product.link,
      category: agent.category || null,
      rating: null,
      reviewCount: null,
      commissionRatePct: null,
      installmentCount: null,
      installmentAmount: null,
      installmentInterestFree: null,
      couponCode: null,
      couponDescription: null,
      badges: [],
      raw: product,
      affiliateLinkVerified,
    });
  }

  return candidates;
}
