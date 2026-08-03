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

    // offerLink e um link de rastreio curto (s.shopee.com.br/...) que a API
    // gera DE NOVO a cada chamada mesmo pro mesmo produto — usa-lo como
    // product_url quebra o dedupe e o rastreamento de preco (cada rodada vira
    // um produto "novo" pro sistema, o historico nunca acumula os 3 dias
    // exigidos por trackAndComputeDiscount). productLink e a pagina real do
    // produto na Shopee e fica estavel entre chamadas — e essa quem deve
    // identificar o produto; offerLink so serve como destino final do clique.
    const stableProductUrl = product.productLink || product.offerLink || "";
    if (!stableProductUrl) continue;

    let affiliateUrl = product.offerLink || "";
    let affiliateLinkVerified = Boolean(affiliateUrl);
    if (!affiliateUrl) {
      try {
        affiliateUrl = await generateShopeeAffiliateShortLink(stableProductUrl);
        affiliateLinkVerified = true;
      } catch {
        affiliateUrl = stableProductUrl;
        affiliateLinkVerified = false;
      }
    }

    candidates.push({
      externalId: `shopee:${product.itemId ?? stableProductUrl}`,
      title: String(product.productName ?? "").trim(),
      price,
      oldPrice: null,
      discountPct: null,
      imageUrl: product.imageUrl ?? null,
      affiliateUrl,
      productUrl: stableProductUrl,
      category: agent.category || null,
      rating: null,
      reviewCount: null,
      commissionRatePct: toCommissionPct(product.commissionRate),
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
