import { fetchShopeeTopProducts, generateShopeeAffiliateShortLink } from "@/lib/shopee/client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// API da Shopee retorna a comissao como fracao decimal em string (ex.: "0.29"
// = 29%). Nao ha desconto/avaliacao real na API — a comissao e o unico sinal
// de qualidade disponivel, usado como fallback no filtro AAV.
function toCommissionPct(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100 * 100) / 100;
}

export async function discoverShopee(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const keyword = agent.searchQuery || agent.category || undefined;
  const result = await fetchShopeeTopProducts(20, keyword, 1);

  const candidates: DiscoveryCandidate[] = [];

  for (const product of result.products) {
    const price = toNumber(product.price);
    if (price <= 0) continue;
    if (typeof agent.priceMin === "number" && price < agent.priceMin) continue;
    if (typeof agent.priceMax === "number" && price > agent.priceMax) continue;

    const rawLink = product.offerLink || product.productLink || "";
    if (!rawLink) continue;

    let affiliateUrl = product.offerLink || "";
    let affiliateLinkVerified = Boolean(affiliateUrl);
    if (!affiliateUrl) {
      try {
        affiliateUrl = await generateShopeeAffiliateShortLink(rawLink);
        affiliateLinkVerified = true;
      } catch {
        affiliateUrl = rawLink;
        affiliateLinkVerified = false;
      }
    }

    candidates.push({
      externalId: `shopee:${product.itemId ?? rawLink}`,
      title: String(product.productName ?? "").trim(),
      price,
      oldPrice: null,
      discountPct: null,
      imageUrl: product.imageUrl ?? null,
      affiliateUrl,
      productUrl: rawLink,
      category: agent.category || null,
      rating: null,
      reviewCount: null,
      commissionRatePct: toCommissionPct(product.commissionRate),
      badges: [],
      raw: product,
      affiliateLinkVerified,
    });
  }

  return candidates;
}
