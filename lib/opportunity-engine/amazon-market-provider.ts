import { load } from "cheerio";

import { sanitizeAmazonUrl } from "@/lib/amazon";
import type {
  ExternalMarketProviderSearchResult,
  ExternalMarketResultItem,
  ExternalMarketSearchInput,
  ExternalMarketSearchProvider,
} from "@/lib/opportunity-engine/external-providers";
import { fetchHtmlWithRotation } from "@/lib/scraping/http-fetch-rotator";

const AMAZON_BASE_URL = "https://www.amazon.com.br";
const AMAZON_MAX_RESULTS = 10;

function amazonAffiliateTag(): string {
  return (
    process.env.AMAZON_TRACKING_ID?.trim() ||
    process.env.AMAZON_AFFILIATE_TAG?.trim() ||
    "radarsmartOf-20"
  );
}

function toText(value: string | undefined | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function parsePriceText(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([0-9][0-9.]*),([0-9]{2})/);
  if (!match) return null;
  const whole = match[1].replace(/\./g, "");
  const parsed = Number(`${whole}.${match[2]}`);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRatingText(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractAsin(value: string): string | null {
  const match = value.toUpperCase().match(/\/(?:DP|GP\/PRODUCT)\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

// Busca ao vivo na pagina de resultados da Amazon (sem API oficial, mesmo
// principio do MercadoLivreMarketSearchProvider): acessa o HTML publico via
// fetchHtmlWithRotation (mesma rotacao de headers ja usada em
// lib/scraping/amazon-extractor.ts para extrair produto individual) e gera o
// link de afiliado com a propria tag, sem depender de Apify/Rainforest.
// O markup de busca da Amazon muda com frequencia e tem deteccao de bot mais
// agressiva que a pagina de produto — os seletores abaixo sao best-effort e
// podem precisar de ajuste se a Amazon mudar o HTML.
export class AmazonMarketSearchProvider implements ExternalMarketSearchProvider {
  readonly name = "amazon-search";

  async search(input: ExternalMarketSearchInput): Promise<ExternalMarketProviderSearchResult> {
    const query = input.query.query.trim();
    if (!query) {
      return { provider: this.name, status: "empty", results: [] };
    }

    try {
      const searchUrl = `${AMAZON_BASE_URL}/s?k=${encodeURIComponent(query)}`;
      const { html } = await fetchHtmlWithRotation({
        url: searchUrl,
        timeoutMs: input.timeout_ms,
        maxAttempts: 1,
        minHtmlLength: 2000,
        blockedPatterns: [
          /enter the characters you see below/i,
          /robot check/i,
          /captcha/i,
          /api-services-support@amazon\.com/i,
          /digite os caracteres/i,
        ],
      });

      const $ = load(html);
      const results: ExternalMarketResultItem[] = [];
      const affiliateTag = amazonAffiliateTag();

      $('div[data-component-type="s-search-result"]').each((_, element) => {
        if (results.length >= AMAZON_MAX_RESULTS) return;

        const node = $(element);

        // Anuncio patrocinado nao e evidencia de preco de mercado organico —
        // e slot comprado, nao posicionamento por competitividade de preco.
        const isSponsored =
          node.find('span:contains("Patrocinado")').length > 0 ||
          node.find('span:contains("Sponsored")').length > 0;
        if (isSponsored) return;

        const asin = toText(node.attr("data-asin"));
        if (!asin) return;

        const title =
          toText(node.find("h2 a span").first().text()) ?? toText(node.find("h2 span").first().text());
        if (!title) return;

        const relativeLink = node.find("h2 a").first().attr("href");
        const productUrl = relativeLink
          ? new URL(relativeLink, AMAZON_BASE_URL).toString()
          : `${AMAZON_BASE_URL}/dp/${asin}`;

        const currentPriceText = toText(
          node.find(".a-price:not(.a-text-price) .a-offscreen").first().text(),
        );
        const price = parsePriceText(currentPriceText);
        if (!price) return;

        const oldPriceText = toText(node.find(".a-price.a-text-price .a-offscreen").first().text());
        const oldPrice = parsePriceText(oldPriceText);

        const imageUrl = toText(node.find("img.s-image").first().attr("src"));
        const rating = parseRatingText(toText(node.find(".a-icon-alt").first().text()));

        results.push({
          source: "amazon",
          marketplace: "amazon",
          seller: null,
          external_product_id: extractAsin(productUrl) ?? asin,
          title,
          url: sanitizeAmazonUrl(productUrl, affiliateTag),
          image_url: imageUrl,
          brand: null,
          model: null,
          category: null,
          price,
          regular_price: oldPrice && oldPrice > price ? oldPrice : price,
          pix_price: null,
          card_price: price,
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
          raw_payload: { asin, rating },
        });
      });

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
        error: error instanceof Error ? error.message : "Amazon search falhou.",
      };
    }
  }
}
