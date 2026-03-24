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

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function findMlbCandidate(value: string): string | null {
  const match = value.toUpperCase().match(/MLB-?\d{6,}/);
  if (!match) return null;
  return match[0].replace("MLB-", "MLB");
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

    const byPdpFilters = findExplicitItemIdInFilters(
      parsed.searchParams.get("pdp_filters") ?? "",
    );
    if (byPdpFilters) return { itemId: byPdpFilters, productId: null };

    const fromHash = findMlbCandidate(parsed.hash);
    if (fromHash) return { itemId: fromHash, productId: null };
  } catch {
    const fallback = findMlbCandidate(source);
    if (fallback) return { itemId: fallback, productId: null };
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

function buildRequestHeaders(accessToken?: string | null): HeadersInit {
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
    toNumber(itemPayload.price) ??
    toNumber(itemPayload.price_amount) ??
    toNumber(salePrice.amount) ??
    toNumber(currentPrice.amount) ??
    null
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function fetchItemById(
  itemId: string,
  headers: HeadersInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const reason =
      toText(payload.message) || toText(payload.error) || `HTTP ${response.status}`;
    throw new Error(`Mercado Livre items API falhou: ${reason}`);
  }
  return payload;
}

async function resolveItemFromProductId(
  productId: string,
  headers: HeadersInit,
): Promise<string | null> {
  const response = await fetch(`https://api.mercadolibre.com/products/${productId}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
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
}

async function resolveItemBySearchSlug(
  sourceUrl: string,
  headers: HeadersInit,
): Promise<string | null> {
  try {
    const parsed = new URL(sourceUrl);
    const slug = parsed.pathname.split("/").filter(Boolean)[0]?.replace(/-/g, " ").trim();
    if (!slug || slug.length < 3) return null;

    const response = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(slug)}&limit=5`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );
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
  }
}

export async function extractMercadoLivreOfficial(
  input: MercadoLivreOfficialInput,
): Promise<MercadoLivreOfficialPreview> {
  const sourceUrl = await resolveShortUrl(toText(input.url));
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
  const affiliateUrl = toText(input.affiliateUrl) || productUrl;

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
