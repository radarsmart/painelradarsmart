import { load } from "cheerio";
import { fetchHtmlWithRotation } from "@/lib/scraping/http-fetch-rotator";
import {
  fetchShopeeProductByIds,
  generateShopeeAffiliateShortLink,
  parseShopeeProductId,
} from "@/lib/shopee/client";

type ExtractionLayer = "json_ld" | "open_graph" | "dom" | "mixed" | "none" | "affiliate_api";

export type ShopeeOfferPreview = {
  marketplace: "shopee";
  sourceUrl: string;
  productUrl: string;
  affiliateUrl: string;
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  oldPrice: number | null;
  discountPct: number | null;
  currency: string;
  extractionMethod: "shopee_html" | "shopee_url" | "shopee_api";
  extractionLayer: ExtractionLayer;
  raw: Record<string, unknown>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toAbsoluteHttpUrl(value: unknown): string | null {
  const raw = toText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw) return null;

  raw = raw
    .replace(/\u00a0/g, "")
    .replace(/[Rr]\$/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return null;

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function computeDiscountPct(price: number | null, oldPrice: number | null): number | null {
  if (!price || !oldPrice || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function parseJsonLd($: ReturnType<typeof load>) {
  let title: string | null = null;
  let imageUrl: string | null = null;
  let price: number | null = null;
  let oldPrice: number | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (title && imageUrl && price) return;
    try {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        title ||= toText(record.name) || null;

        const image = Array.isArray(record.image) ? record.image[0] : record.image;
        imageUrl ||= toAbsoluteHttpUrl(image) || null;

        const offers = record.offers as Record<string, unknown> | undefined;
        if (offers) {
          price ||= toNumber(offers.price);
          oldPrice ||= toNumber(offers.highPrice) || toNumber(offers.priceSpecification);
        }
      }
    } catch {
      return;
    }
  });

  return { title, imageUrl, price, oldPrice };
}

function parseOpenGraph($: ReturnType<typeof load>) {
  const title =
    toText($('meta[property="og:title"]').attr("content")) ||
    toText($('meta[name="twitter:title"]').attr("content")) ||
    null;
  const imageUrl =
    toAbsoluteHttpUrl($('meta[property="og:image"]').attr("content")) ||
    toAbsoluteHttpUrl($('meta[name="twitter:image"]').attr("content")) ||
    null;
  const price =
    toNumber($('meta[property="product:price:amount"]').attr("content")) ||
    toNumber($('meta[property="og:price:amount"]').attr("content")) ||
    null;

  return { title, imageUrl, price };
}

function parseDom($: ReturnType<typeof load>) {
  const title =
    toText($("h1").first().text()) ||
    toText($('[data-testid="pdp-product-title"]').first().text()) ||
    null;

  const imageUrl =
    toAbsoluteHttpUrl($('img[data-testid="product-image"]').attr("src")) ||
    toAbsoluteHttpUrl($("img").first().attr("src")) ||
    null;

  const bodyText = $("body").text();
  const priceMatches = Array.from(
    bodyText.matchAll(/R\$\s*([0-9][0-9.\s]*)(?:,([0-9]{2}))?/gi),
  ).map((match) => {
    const whole = String(match[1] ?? "").replace(/\s+/g, "");
    const cents = String(match[2] ?? "");
    return toNumber(cents ? `${whole},${cents}` : whole);
  }).filter((value): value is number => typeof value === "number" && value > 0);

  const price = priceMatches[0] ?? null;
  const oldPrice = priceMatches.find((value) => price !== null && value > price) ?? null;

  return { title, imageUrl, price, oldPrice };
}

/**
 * Tenta resolver o produto direto pela API oficial de afiliados (shopId +
 * itemId extraidos da propria URL) — sem nenhum scraping. A Shopee bloqueia
 * o fetch da pagina do produto com frequencia (deteccao de bot), e essa via
 * nao depende disso: e uma chamada autenticada normal, tao confiavel quanto
 * a geracao do link de afiliado (que ja usava essa mesma API). So retorna
 * null quando a URL nao tem o padrao "i.<shopId>.<itemId>"/"/product/.../..."
 * ou quando a API nao encontra o item.
 */
async function tryExtractShopeeViaApi(sourceUrl: string): Promise<ShopeeOfferPreview | null> {
  const ids = parseShopeeProductId(sourceUrl);
  if (!ids) return null;

  const node = await fetchShopeeProductByIds(ids.shopId, ids.itemId).catch(() => null);
  if (!node?.productName) return null;

  const price = toNumber(node.price);
  const productUrl = toText(node.productLink) || sourceUrl;
  const affiliateUrl = toText(node.offerLink) || productUrl;

  return {
    marketplace: "shopee",
    sourceUrl,
    productUrl,
    affiliateUrl,
    title: toText(node.productName) || null,
    imageUrl: toAbsoluteHttpUrl(node.imageUrl),
    price,
    oldPrice: null,
    discountPct: null,
    currency: "BRL",
    extractionMethod: "shopee_api",
    extractionLayer: "affiliate_api",
    raw: { node },
  };
}

export async function extractShopeeOffer(input: {
  url: string;
  affiliateUrl?: string | null;
}): Promise<ShopeeOfferPreview> {
  const sourceUrl = toText(input.url);
  if (!sourceUrl) throw new Error("URL da Shopee obrigatoria.");

  const viaApi = await tryExtractShopeeViaApi(sourceUrl);
  if (viaApi) {
    return input.affiliateUrl ? { ...viaApi, affiliateUrl: toText(input.affiliateUrl) } : viaApi;
  }

  const { html, finalUrl, profile, status } = await fetchHtmlWithRotation({
    url: sourceUrl,
    timeoutMs: 15000,
    maxAttempts: 3,
    minHtmlLength: 1200,
    extraHeaders: {
      referer: "https://shopee.com.br/",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
    },
  });

  const $ = load(html);
  const jsonLd = parseJsonLd($);
  const openGraph = parseOpenGraph($);
  const dom = parseDom($);

  const title = jsonLd.title || openGraph.title || dom.title;
  const imageUrl = jsonLd.imageUrl || openGraph.imageUrl || dom.imageUrl;
  const price = jsonLd.price || openGraph.price || dom.price;
  const oldPrice = jsonLd.oldPrice || dom.oldPrice || null;
  const affiliateUrl =
    toText(input.affiliateUrl) ||
    (await generateShopeeAffiliateShortLink(finalUrl).catch(() => finalUrl));

  const validLayers = [
    Boolean(jsonLd.title || jsonLd.imageUrl || jsonLd.price) ? "json_ld" : null,
    Boolean(openGraph.title || openGraph.imageUrl || openGraph.price) ? "open_graph" : null,
    Boolean(dom.title || dom.imageUrl || dom.price) ? "dom" : null,
  ].filter(Boolean) as ExtractionLayer[];

  const extractionLayer =
    validLayers.length >= 2
      ? "mixed"
      : validLayers[0] ?? "none";

  return {
    marketplace: "shopee",
    sourceUrl,
    productUrl: finalUrl,
    affiliateUrl,
    title,
    imageUrl,
    price,
    oldPrice,
    discountPct: computeDiscountPct(price, oldPrice),
    currency: "BRL",
    extractionMethod: "shopee_html",
    extractionLayer,
    raw: {
      final_url: finalUrl,
      profile,
      status,
      json_ld: jsonLd,
      open_graph: openGraph,
      dom,
    },
  };
}
