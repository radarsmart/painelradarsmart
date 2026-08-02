import { searchViaMlSession } from "@/lib/scraping/ml-session-client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

export async function discoverMercadoLivre(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const query = agent.searchQuery || agent.category;
  if (!query) {
    throw new Error("Agente de Mercado Livre precisa de um termo de busca/categoria configurado.");
  }

  const items = await searchViaMlSession(query, 30);
  const candidates: DiscoveryCandidate[] = [];

  for (const item of items) {
    if (!item.link || !item.price || item.price <= 0) continue;
    if (typeof agent.priceMin === "number" && item.price < agent.priceMin) continue;
    if (typeof agent.priceMax === "number" && item.price > agent.priceMax) continue;

    const oldPrice = item.old_price && item.old_price > item.price ? item.old_price : null;
    const discountPct = oldPrice ? Math.round(((oldPrice - item.price) / oldPrice) * 100) : null;

    // O link de afiliado real (meli.la/...) e gerado sob demanda em run-agent.ts,
    // so para os candidatos que sobreviverem a selecao — gerar aqui pra todos os
    // resultados da busca seria caro (automacao de navegador por produto).
    candidates.push({
      externalId: `mercadolivre:${item.link}`,
      title: item.title,
      price: item.price,
      oldPrice,
      discountPct,
      imageUrl: item.image_url,
      affiliateUrl: item.link,
      productUrl: item.link,
      category: agent.category || null,
      rating: item.rating,
      // reviewCount aqui e usado como proxy de volume/"vendas recorrentes":
      // o card de busca do ML mostra quantidade vendida, nao contagem de
      // avaliacoes, mas alimenta o mesmo calculo de popularidade do AAV.
      reviewCount: item.sold_count,
      commissionRatePct: null,
      installmentCount: item.installments?.count ?? null,
      installmentAmount: item.installments?.amount ?? null,
      installmentInterestFree: item.installments?.interest_free ?? null,
      couponCode: null,
      couponDescription: null,
      badges: item.is_full ? ["FULL"] : [],
      raw: item,
      affiliateLinkVerified: false,
    });
  }

  return candidates;
}
