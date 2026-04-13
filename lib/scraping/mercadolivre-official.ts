import { normalizeMercadoLivreAffiliateUrl } from "@/lib/mercadolivre";

type MercadoLivreOfficialInput = {
  url: string;
  affiliateUrl?: string | null;
  accessToken?: string | null;
};

export type MercadoLivreOfficialPreview = {
  itemId: string;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  permalink: string;
  productUrl: string;
  affiliateUrl: string;
  condition: string | null;
  status: string | null;
  rawData: Record<string, unknown>;
};

type ExtractedMlIds = {
  itemId: string | null;
  productId: string | null;
};

type MercadoLivreHtmlMetadataFromHtmlInput = {
  html: string;
  sourceUrl: string;
  finalUrl?: string | null;
  affiliateUrl?: string | null;
  rawData?: Record<string, unknown>;
};

const ML_BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  referer: "https://www.mercadolivre.com.br/",
  "cache-control": "no-cache",
  "sec-ch-ua": '"Chromium";v="123", "Not-A.Brand";v="8"',
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
};

const ML_API_TIMEOUT_MS = 4000;
const ML_HTML_TIMEOUT_MS = 8000;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html: string, key: string): string {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return "";
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1]) : "";
}

function sanitizeMercadoLivreTitle(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+-\s+R\$\s*[\d.,]+.*$/i, "")
    .replace(/\s*\|\s*Mercado\s*Livre.*$/i, "")
    .replace(/\s*\|\s*MercadoLivre.*$/i, "")
    .trim();
}

function parseBrazilianCurrency(value: string): number | null {
  const match = value.match(/R\$\s*([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)/i);
  if (!match?.[1]) return null;

  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  return toNumber(normalized);
}

function extractJsonNumber(html: string, keys: string[]): number | null {
  for (const key of keys) {
    const pattern = new RegExp(`["']${escapeRegExp(key)}["']\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i");
    const match = html.match(pattern);
    const parsed = toNumber(match?.[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function toAbsoluteMercadoLivreUrl(value: string, baseUrl: string): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function extractItemIdFromHtml(html: string, sourceUrl: string): string | null {
  const appUrl =
    extractMetaContent(html, "twitter:app:url:iphone") ||
    extractMetaContent(html, "twitter:app:url:ipad") ||
    extractMetaContent(html, "twitter:app:url:googleplay");

  return (
    findMlbCandidate(appUrl) ||
    findMlbCandidate(html.match(/meli:\/\/item\?id=(MLB-?\d+)/i)?.[1] ?? "") ||
    findMlbCandidate(html.match(/["']item_id["']\s*:\s*["']?(MLB-?\d+)/i)?.[1] ?? "") ||
    findMlbCandidate(sourceUrl)
  );
}

function normalizeMlCode(value: string): string {
  return value.toUpperCase().replace(/^([A-Z]+)-/, "$1");
}

function findMlbCandidate(value: string): string | null {
  const match = value.toUpperCase().match(/MLB-?\d{8,}/);
  if (!match) return null;
  return normalizeMlCode(match[0]);
}

function findMlProductCandidate(value: string): string | null {
  const match = value.toUpperCase().match(/ML[A-Z]{2,3}-?\d{6,}/);
  if (!match) return null;
  return normalizeMlCode(match[0]);
}

function normalizeMercadoLivreUrl(rawUrl: string): string {
  const value = toText(rawUrl);
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const keepParams = new URLSearchParams();

    for (const key of ["wid", "item_id", "itemId", "id"]) {
      const param = parsed.searchParams.get(key);
      if (param) keepParams.set(key, param);
    }

    parsed.search = keepParams.toString();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.split("#")[0]?.trim() || value;
  }
}

function stripAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
  const cloned = { ...headers };
  delete cloned.authorization;
  delete cloned.Authorization;
  return cloned;
}

function findExplicitItemIdInFilters(value: string): string | null {
  const normalized = toText(value);
  if (!normalized) return null;

  const match = normalized.match(/(?:^|[;,])\s*item_id\s*:?\s*(MLB-?\d{6,})/i);
  if (!match) return null;

  return match[1].toUpperCase().replace("MLB-", "MLB");
}

function extractIdsFromUrl(url: string): ExtractedMlIds {
  const source = toText(url);
  if (!source) return { itemId: null, productId: null };

  try {
    const parsed = new URL(source);
    const pathLower = parsed.pathname.toLowerCase();

    const byWid = findMlbCandidate(parsed.searchParams.get("wid") ?? "");
    if (byWid) return { itemId: byWid, productId: null };

    const candidateKeys = ["item_id", "itemId", "id"];
    for (const key of candidateKeys) {
      const value = parsed.searchParams.get(key);
      if (!value) continue;
      const candidate = findMlbCandidate(value);
      if (candidate) return { itemId: candidate, productId: null };
    }

    const fromPath = findMlbCandidate(parsed.pathname);
    if (fromPath) {
      if (pathLower.includes("/p/")) {
        return { itemId: null, productId: fromPath };
      }
      return { itemId: fromPath, productId: null };
    }

    const productIdFromPath = findMlProductCandidate(parsed.pathname);
    if (productIdFromPath) {
      if (pathLower.includes("/p/") || pathLower.includes("/up/")) {
        return { itemId: null, productId: productIdFromPath };
      }
      return { itemId: null, productId: productIdFromPath };
    }

    const byPdpFilters = findExplicitItemIdInFilters(
      parsed.searchParams.get("pdp_filters") ?? "",
    );
    if (byPdpFilters) return { itemId: byPdpFilters, productId: null };

    const fromHash = findMlbCandidate(parsed.hash);
    if (fromHash) return { itemId: fromHash, productId: null };

    const productIdFromHash = findMlProductCandidate(parsed.hash);
    if (productIdFromHash) return { itemId: null, productId: productIdFromHash };
  } catch {
    const fallback = findMlbCandidate(source);
    if (fallback) return { itemId: fallback, productId: null };
    const fallbackProduct = findMlProductCandidate(source);
    if (fallbackProduct) return { itemId: null, productId: fallbackProduct };
  }

  return { itemId: null, productId: null };
}

export function extractMercadoLivreItemId(url: string): string | null {
  return extractIdsFromUrl(url).itemId;
}

async function waitForNaturalDelay(): Promise<void> {
  const delayMs = 1500 + Math.floor(Math.random() * 1000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function resolveShortUrl(url: string): Promise<string> {
  const source = toText(url);
  if (!source.toLowerCase().includes("meli.la")) return source;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await waitForNaturalDelay();
    const response = await fetch(source, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: ML_BROWSER_HEADERS,
      cache: "no-store",
    });
    return toText(response.url) || source;
  } catch {
    return source;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestHeaders(accessToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...ML_BROWSER_HEADERS,
    accept: "application/json",
  };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function pickImageFromItemPayload(itemPayload: Record<string, unknown>): string {
  const pictures = Array.isArray(itemPayload.pictures)
    ? (itemPayload.pictures as Array<Record<string, unknown>>)
    : [];
  const firstPicture = pictures[0] ?? {};

  return (
    toText(itemPayload.secure_thumbnail) ||
    toText(itemPayload.thumbnail) ||
    toText(firstPicture.secure_url) ||
    toText(firstPicture.url) ||
    ""
  );
}

function pickCurrentPriceFromItemPayload(itemPayload: Record<string, unknown>): number | null {
  const salePrice = toRecord(itemPayload.sale_price);
  const priceInfo = toRecord(itemPayload.price_info);
  const currentPrice = toRecord(priceInfo.current_price);

  return (
    toNumber(salePrice.amount) ??
    toNumber(currentPrice.amount) ??
    toNumber(itemPayload.price) ??
    toNumber(itemPayload.price_amount) ??
    null
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function fetchItemById(
  itemId: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_API_TIMEOUT_MS);

  try {
    const request = (requestHeaders: HeadersInit) =>
      fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        method: "GET",
        headers: requestHeaders,
        cache: "no-store",
        signal: controller.signal,
      });

    let response = await request(headers);
    if ((response.status === 401 || response.status === 403) && headers.authorization) {
      response = await request(stripAuthorizationHeader(headers));
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const reason =
        toText(payload.message) || toText(payload.error) || `HTTP ${response.status}`;
      throw new Error(`Mercado Livre items API falhou: ${reason}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveItemFromProductId(
  productId: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_API_TIMEOUT_MS);

  try {
    const request = (requestHeaders: HeadersInit) =>
      fetch(`https://api.mercadolibre.com/products/${productId}`, {
        method: "GET",
        headers: requestHeaders,
        cache: "no-store",
        signal: controller.signal,
      });

    let response = await request(headers);
    if ((response.status === 401 || response.status === 403) && headers.authorization) {
      response = await request(stripAuthorizationHeader(headers));
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return null;

    const winnerRaw = payload.buy_box_winner;
    const winner =
      findMlbCandidate(toText(winnerRaw)) ||
      findMlbCandidate(toText((winnerRaw as Record<string, unknown> | null)?.id));
    if (winner) return winner;

    const items = Array.isArray(payload.items)
      ? (payload.items as Array<Record<string, unknown>>)
      : [];
    for (const item of items) {
      const candidate =
        findMlbCandidate(toText(item.id)) || findMlbCandidate(toText(item.item_id));
      if (candidate) return candidate;
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveItemBySearchSlug(
  sourceUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const parsed = new URL(sourceUrl);
    const slug = parsed.pathname.split("/").filter(Boolean)[0]?.replace(/-/g, " ").trim();
    if (!slug || slug.length < 3) return null;

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), ML_API_TIMEOUT_MS);
    const request = (requestHeaders: HeadersInit) =>
      fetch(
        `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(slug)}&limit=5`,
        {
          method: "GET",
          headers: requestHeaders,
          cache: "no-store",
          signal: controller.signal,
        },
      );

    let response = await request(headers);
    if ((response.status === 401 || response.status === 403) && headers.authorization) {
      response = await request(stripAuthorizationHeader(headers));
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return null;

    const results = Array.isArray(payload.results)
      ? (payload.results as Array<Record<string, unknown>>)
      : [];
    for (const result of results) {
      const itemId = findMlbCandidate(toText(result.id));
      if (itemId) return itemId;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function extractMercadoLivreHtmlMetadata(
  input: MercadoLivreOfficialInput,
): Promise<MercadoLivreOfficialPreview> {
  const sourceUrl = normalizeMercadoLivreUrl(await resolveShortUrl(toText(input.url)));
  if (!sourceUrl) throw new Error("URL Mercado Livre obrigatoria.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_HTML_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: ML_BROWSER_HEADERS,
      cache: "no-store",
    });

    const html = await response.text();
    if (!response.ok || !html) {
      throw new Error(`HTML Mercado Livre indisponivel: HTTP ${response.status}`);
    }

    return extractMercadoLivreHtmlMetadataFromHtml({
      html,
      sourceUrl,
      finalUrl: toText(response.url) || sourceUrl,
      affiliateUrl: input.affiliateUrl,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function extractMercadoLivreHtmlMetadataFromHtml(
  input: MercadoLivreHtmlMetadataFromHtmlInput,
): MercadoLivreOfficialPreview {
  const html = toText(input.html);
  const sourceUrl = toText(input.sourceUrl);
  const finalUrl = toText(input.finalUrl) || sourceUrl;

  if (!html) {
    throw new Error("HTML Mercado Livre vazio.");
  }

  const ogTitle = extractMetaContent(html, "og:title");
  const title =
    sanitizeMercadoLivreTitle(ogTitle) ||
    sanitizeMercadoLivreTitle(extractMetaContent(html, "twitter:title")) ||
    sanitizeMercadoLivreTitle(extractHtmlTitle(html));

  const ogImage = extractMetaContent(html, "og:image");
  const twitterImage = extractMetaContent(html, "twitter:image");
  const imageUrl = toAbsoluteMercadoLivreUrl(ogImage || twitterImage, finalUrl);
  const permalink = extractMetaContent(html, "og:url") || finalUrl;
  const itemId = extractItemIdFromHtml(html, finalUrl) || "";
  const price =
    parseBrazilianCurrency(ogTitle) ||
    extractJsonNumber(html, ["price", "localItemPrice", "amount"]);
  const oldPrice = extractJsonNumber(html, [
    "original_price",
    "originalPrice",
    "base_price",
    "previous_price",
  ]);
  const productUrl = permalink || finalUrl;
  const affiliateUrl = normalizeMercadoLivreAffiliateUrl(
    toText(input.affiliateUrl) || productUrl,
  );

  if (!title && !price && !imageUrl) {
    throw new Error("HTML Mercado Livre sem metadados suficientes.");
  }

  return {
    itemId,
    title,
    price,
    oldPrice,
    imageUrl,
    permalink,
    productUrl,
    affiliateUrl,
    condition: null,
    status: null,
    rawData: {
      source_url: sourceUrl,
      final_url: finalUrl,
      resolved_item_id: itemId || null,
      extraction_layer: "html_metadata",
      og_title: ogTitle,
      og_image: ogImage,
      ...(input.rawData ?? {}),
    },
  };
}

export async function extractMercadoLivreOfficial(
  input: MercadoLivreOfficialInput,
): Promise<MercadoLivreOfficialPreview> {
  const sourceUrl = normalizeMercadoLivreUrl(await resolveShortUrl(toText(input.url)));
  if (!sourceUrl) throw new Error("URL Mercado Livre obrigatoria.");

  const headers = buildRequestHeaders(input.accessToken ?? undefined);
  const ids = extractIdsFromUrl(sourceUrl);

  let itemId = ids.itemId;
  if (!itemId && ids.productId) {
    itemId = await resolveItemFromProductId(ids.productId, headers);
  }
  if (!itemId) {
    itemId = await resolveItemBySearchSlug(sourceUrl, headers);
  }
  if (!itemId) {
    throw new Error("Nao foi possivel identificar item_id do Mercado Livre.");
  }

  const itemPayload = await fetchItemById(itemId, headers);
  const imageUrl = pickImageFromItemPayload(itemPayload);
  const permalink = toText(itemPayload.permalink) || sourceUrl;
  const productUrl = permalink;
  const affiliateUrl = normalizeMercadoLivreAffiliateUrl(
    toText(input.affiliateUrl) || productUrl,
  );

  return {
    itemId,
    title: toText(itemPayload.title),
    price: pickCurrentPriceFromItemPayload(itemPayload),
    oldPrice: toNumber(itemPayload.base_price) ?? toNumber(itemPayload.original_price),
    imageUrl,
    permalink,
    productUrl,
    affiliateUrl,
    condition: toText(itemPayload.condition) || null,
    status: toText(itemPayload.status) || null,
    rawData: {
      ...itemPayload,
      source_url: sourceUrl,
      resolved_item_id: itemId,
      resolved_product_id: ids.productId,
    },
  };
}
