import { fetchAwinAdvertiserFeedProducts, fetchAwinOffers } from "@/lib/awin/client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

const DEFAULT_ADVERTISER_ID = "18879";

// Cupom da AWIN e por loja (advertiser), nao por produto — busca o melhor
// cupom ativo do anunciante uma vez por rodada e aplica em todos os
// candidatos dessa loja, em vez de tentar (impossivel) casar cupom com SKU.
async function fetchBestVoucherForAdvertiser(
  advertiserId: string,
): Promise<{ code: string; description: string } | null> {
  try {
    const offers = await fetchAwinOffers({
      advertiserId,
      type: "voucher",
      status: "active",
      pageSize: 10,
    });
    const withCode = offers.find((offer) => offer.voucherCode);
    if (!withCode) return null;
    return { code: withCode.voucherCode, description: withCode.title };
  } catch {
    return null;
  }
}

export async function discoverAwin(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const advertiserId = agent.advertiserId || DEFAULT_ADVERTISER_ID;

  const [result, voucher] = await Promise.all([
    fetchAwinAdvertiserFeedProducts({
      advertiserId,
      search: agent.searchQuery || undefined,
      category: agent.category || undefined,
      sort: "best_deals",
      page: 1,
      priceMin: agent.priceMin,
      priceMax: agent.priceMax,
    }),
    fetchBestVoucherForAdvertiser(advertiserId),
  ]);

  return result.products.map((product) => ({
    externalId: `awin:${advertiserId}:${product.id || product.awDeepLink}`,
    title: product.productName,
    price: product.searchPrice,
    oldPrice: product.basePrice,
    discountPct: product.savingsPercent,
    imageUrl: product.merchantImageUrl || null,
    affiliateUrl: product.awDeepLink,
    productUrl: product.merchantDeepLink || product.awDeepLink,
    category: product.categoryName || null,
    rating: Number.isFinite(product.rating) ? product.rating : null,
    reviewCount: null,
    commissionRatePct: null,
    installmentCount: null,
    installmentAmount: null,
    installmentInterestFree: null,
    couponCode: voucher?.code ?? null,
    couponDescription: voucher?.description ?? null,
    badges: product.isFreeShipping ? ["frete gratis"] : [],
    raw: product,
    affiliateLinkVerified: true,
  }));
}
