import { fetchShopeeTopProducts } from "@/lib/shopee/client";
import type {
  ExternalMarketProviderSearchResult,
  ExternalMarketResultItem,
  ExternalMarketSearchInput,
  ExternalMarketSearchProvider,
} from "@/lib/opportunity-engine/external-providers";

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export class ShopeeMarketSearchProvider implements ExternalMarketSearchProvider {
  readonly name = "shopee-search";

  async search(input: ExternalMarketSearchInput): Promise<ExternalMarketProviderSearchResult> {
    try {
      const { products } = await fetchShopeeTopProducts(10, input.query.query);
      const results: ExternalMarketResultItem[] = [];

      for (const item of products) {
        const price = toNumber(item.price);
        const title = toText(item.productName);
        if (!title || !price || price <= 0) continue;

        const priceMax = toNumber(item.priceMax);

        results.push({
          source: "shopee",
          marketplace: "shopee",
          seller: toText(item.shopName),
          external_product_id: toText(item.itemId),
          title,
          url: toText(item.offerLink) ?? toText(item.productLink),
          image_url: toText(item.imageUrl),
          brand: null,
          model: null,
          category: null,
          price,
          regular_price: priceMax && priceMax > price ? priceMax : price,
          pix_price: price,
          card_price: null,
          installments: null,
          installment_count: null,
          installment_value: null,
          installment_amount: null,
          interest_free: null,
          installment_interest_free: null,
          shipping_cost: null,
          currency: "BRL",
          payment_information_original: null,
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
        error: error instanceof Error ? error.message : "Shopee search falhou.",
      };
    }
  }
}

export function isShopeeMarketSearchConfigured(): boolean {
  return Boolean(
    String(process.env.SHOPEE_APP_ID ?? "").trim() && String(process.env.SHOPEE_SECRET_KEY ?? "").trim(),
  );
}
