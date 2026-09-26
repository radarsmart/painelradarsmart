import { searchViaMlSession } from "@/lib/scraping/ml-session-client";
import type {
  ExternalMarketProviderSearchResult,
  ExternalMarketResultItem,
  ExternalMarketSearchInput,
  ExternalMarketSearchProvider,
} from "@/lib/opportunity-engine/external-providers";

// Slots patrocinados/brand ads misturados na busca vem com link de rastreio
// de clique em vez de link de produto de verdade (mesmo filtro usado em
// lib/sales-agents/discovery/mercadolivre.ts) — nunca sao evidencia valida
// de preco de concorrente, entao descarta antes de virar comparacao.
const SPONSORED_LINK_PATTERN = /click1\.mercadolivre\.com\.br|\/clicks\//i;

function extractItemId(link: string): string | null {
  const match = link.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
}

export class MercadoLivreMarketSearchProvider implements ExternalMarketSearchProvider {
  readonly name = "mercadolivre-search";

  async search(input: ExternalMarketSearchInput): Promise<ExternalMarketProviderSearchResult> {
    try {
      const items = await searchViaMlSession(input.query.query, 10);
      const results: ExternalMarketResultItem[] = [];

      for (const item of items) {
        if (!item.link || !item.title || !item.price || item.price <= 0) continue;
        if (SPONSORED_LINK_PATTERN.test(item.link)) continue;

        const hasOldPrice = item.old_price !== null && item.old_price > item.price;

        results.push({
          source: "mercadolivre",
          marketplace: "mercadolivre",
          seller: null,
          external_product_id: extractItemId(item.link),
          title: item.title,
          url: item.link,
          image_url: item.image_url,
          brand: null,
          model: null,
          category: null,
          price: item.price,
          regular_price: hasOldPrice ? item.old_price : item.price,
          pix_price: item.price,
          card_price: null,
          installments: item.installments?.count ?? null,
          installment_count: item.installments?.count ?? null,
          installment_value: item.installments?.amount ?? null,
          installment_amount: item.installments?.amount ?? null,
          interest_free: item.installments?.interest_free ?? null,
          installment_interest_free: item.installments?.interest_free ?? null,
          shipping_cost: null,
          currency: "BRL",
          payment_information_original: item.installments?.text ?? null,
          captured_at: new Date().toISOString(),
          raw_payload: item,
        });
      }

      return {
        provider: this.name,
        status: results.length ? "success" : "empty",
        results,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "error",
        results: [],
        error: error instanceof Error ? error.message : "Mercado Livre search falhou.",
      };
    }
  }
}

export function isMercadoLivreMarketSearchConfigured(): boolean {
  return Boolean(String(process.env.ML_SESSION_API_URL ?? "").trim());
}
