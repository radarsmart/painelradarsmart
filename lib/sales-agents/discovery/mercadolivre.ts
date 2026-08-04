import { searchViaMlSession } from "@/lib/scraping/ml-session-client";
import type { SalesAgent, DiscoveryCandidate } from "../types";

// O link que o ML devolve na busca vem com querystring/fragment de rastreio
// (searchVariation, pdp_filters, tracking_id, sid...) que muda a cada busca
// mesmo sendo o MESMO anuncio — se usarmos o link cru como product_url, o
// dedupe por URL exata nunca reconhece que ja publicamos aquele produto, e o
// agente acaba reenviando a mesma oferta pro grupo como se fosse nova.
// Normaliza pro formato canonico "produto.mercadolivre.com.br/MLB-{id}", sem
// query/hash, pra dedupe funcionar mesmo quando o link muda de contexto.
function canonicalizeMlProductUrl(rawUrl: string): string {
  const match = rawUrl.match(/MLB-?(\d+)/i);
  if (!match) return rawUrl;
  return `https://produto.mercadolivre.com.br/MLB-${match[1]}`;
}

export async function discoverMercadoLivre(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const query = agent.searchQuery || agent.category;
  if (!query) {
    throw new Error("Agente de Mercado Livre precisa de um termo de busca/categoria configurado.");
  }

  const items = await searchViaMlSession(query, 30);
  const candidates: DiscoveryCandidate[] = [];

  for (const item of items) {
    if (!item.link || !item.price || item.price <= 0) continue;
    // Slots patrocinados/brand ads misturados nos resultados de busca vem com
    // link de rastreio de clique (ex.: click1.mercadolivre.com.br/.../clicks/...)
    // em vez de link de produto de verdade — nunca geram link de afiliado
    // valido, entao descarta aqui em vez de deixar virar oferta travada.
    if (/click1\.mercadolivre\.com\.br|\/clicks\//i.test(item.link)) continue;
    if (typeof agent.priceMin === "number" && item.price < agent.priceMin) continue;
    if (typeof agent.priceMax === "number" && item.price > agent.priceMax) continue;

    const oldPrice = item.old_price && item.old_price > item.price ? item.old_price : null;
    const discountPct = oldPrice ? Math.round(((oldPrice - item.price) / oldPrice) * 100) : null;
    const canonicalUrl = canonicalizeMlProductUrl(item.link);

    // O link de afiliado real (meli.la/...) e gerado sob demanda em run-agent.ts,
    // so para os candidatos que sobreviverem a selecao — gerar aqui pra todos os
    // resultados da busca seria caro (automacao de navegador por produto).
    candidates.push({
      externalId: `mercadolivre:${canonicalUrl}`,
      title: item.title,
      price: item.price,
      oldPrice,
      discountPct,
      imageUrl: item.image_url,
      affiliateUrl: item.link,
      productUrl: canonicalUrl,
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
