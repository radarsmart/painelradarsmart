import { gunzipSync } from "node:zlib";

const AWIN_BASE_URL = "https://api.awin.com";
const DEFAULT_PUBLISHER_ID = "2843910";
const AWIN_ADVERTISER_FEED_PAGE_SIZE = 24;
const AWIN_ADVERTISER_FEED_COLUMNS = [
  "aw_product_id",
  "product_name",
  "description",
  "merchant_product_id",
  "merchant_image_url",
  "aw_deep_link",
  "merchant_deep_link",
  "search_price",
  "currency",
  "merchant_name",
  "category_name",
  "average_rating",
  "rating",
  "reviews",
].join(",");

type AwinProgramme = {
  id?: number | string | null;
  name?: string | null;
  displayUrl?: string | null;
  clickThroughUrl?: string | null;
  logoUrl?: string | null;
  status?: string | null;
  currencyCode?: string | null;
  primaryRegion?: {
    name?: string | null;
    countryCode?: string | null;
  } | null;
};

type AwinOffer = {
  promotionId?: number | string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  terms?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  url?: string | null;
  urlTracking?: string | null;
  advertiser?: {
    id?: number | string | null;
    name?: string | null;
    joined?: boolean | null;
  } | null;
  voucher?: {
    code?: string | null;
    exclusive?: boolean | null;
    attributable?: boolean | null;
  } | null;
};

export type NormalizedAwinProgramme = {
  id: string;
  name: string;
  displayUrl: string;
  clickThroughUrl: string;
  logoUrl: string;
  status: string;
  currencyCode: string;
  region: string;
};

export type NormalizedAwinAdvertiser = {
  id: string;
  name: string;
  logoUrl: string;
};

export type NormalizedAwinOffer = {
  id: string;
  type: string;
  title: string;
  description: string;
  terms: string;
  advertiserId: string;
  advertiserName: string;
  joined: boolean;
  startDate: string;
  endDate: string;
  url: string;
  trackingUrl: string;
  voucherCode: string;
};

export type NormalizedAwinFeed = {
  id: string;
  name: string;
  advertiserId: string;
  advertiserName: string;
  language: string;
  region: string;
  lastUpdated: string;
  downloadUrl: string;
};

export type NormalizedAwinProduct = {
  id: string;
  name: string;
  merchantProductId: string;
  merchantId: string;
  merchantName: string;
  categoryName: string;
  categoryId: string;
  price: number;
  displayPrice: string;
  currency: string;
  imageUrl: string;
  description: string;
  deepLink: string;
  merchantDeepLink: string;
  lastUpdated: string;
};

export type NormalizedAwinAdvertiserFeedProduct = {
  id: string;
  productName: string;
  description: string;
  merchantProductId: string;
  merchantImageUrl: string;
  awDeepLink: string;
  merchantDeepLink: string;
  searchPrice: number;
  currency: string;
  originalSearchPrice: number;
  originalCurrency: string;
  merchantName: string;
  categoryName: string;
  rating: number;
};

type AwinAdvertiserFeedSort = "best_deals" | "top_selling" | "";

function cleanEnv(value?: string) {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getAwinPublisherId() {
  return cleanEnv(process.env.AWIN_PUBLISHER_ID) || DEFAULT_PUBLISHER_ID;
}

function getAwinToken() {
  return cleanEnv(process.env.AWIN_API_TOKEN);
}

function getAwinFeedListUrl() {
  return cleanEnv(process.env.AWIN_PRODUCT_FEED_LIST_URL);
}

function getAwinProductFeedDownloadUrl() {
  return cleanEnv(process.env.AWIN_PRODUCT_FEED_DOWNLOAD_URL);
}

function getAwinDatafeedApiKey() {
  const explicitKey = cleanEnv(process.env.AWIN_DATAFEED_API_KEY);
  if (explicitKey) return explicitKey;

  for (const value of [getAwinProductFeedDownloadUrl(), getAwinFeedListUrl()]) {
    const match = value.match(/\/apikey\/([^/]+)/) || value.match(/\/publisher\/[^/]+\/([^/]+)\/1\/feedList/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  return getAwinToken();
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function getAwinUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const token = getAwinToken();
  const query = new URLSearchParams();
  query.set("accessToken", token);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }

  return `${AWIN_BASE_URL}${path}?${query.toString()}`;
}

async function awinFetch(path: string, init?: RequestInit, params?: Record<string, string | number | boolean | undefined>) {
  const token = getAwinToken();
  if (!token) {
    throw new Error("AWIN_API_TOKEN nao configurado no servidor.");
  }

  const response = await fetch(getAwinUrl(path, params), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AWIN retornou HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return response.json() as Promise<unknown>;
}

function normalizeProgramme(programme: AwinProgramme): NormalizedAwinProgramme | null {
  const id = toText(programme.id);
  const name = toText(programme.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    displayUrl: toText(programme.displayUrl),
    clickThroughUrl: toText(programme.clickThroughUrl),
    logoUrl: toText(programme.logoUrl),
    status: toText(programme.status) || "Active",
    currencyCode: toText(programme.currencyCode),
    region: toText(programme.primaryRegion?.countryCode) || toText(programme.primaryRegion?.name),
  };
}

function normalizeOffer(offer: AwinOffer): NormalizedAwinOffer | null {
  const id = toText(offer.promotionId);
  const title = toText(offer.title);
  const trackingUrl = toText(offer.urlTracking);
  if (!id || !title) return null;

  return {
    id,
    type: toText(offer.type) || "offer",
    title,
    description: toText(offer.description),
    terms: toText(offer.terms),
    advertiserId: toText(offer.advertiser?.id),
    advertiserName: toText(offer.advertiser?.name) || "AWIN",
    joined: offer.advertiser?.joined === true,
    startDate: toText(offer.startDate),
    endDate: toText(offer.endDate),
    url: toText(offer.url),
    trackingUrl,
    voucherCode: toText(offer.voucher?.code),
  };
}

export function getAwinConfigStatus() {
  return {
    publisherId: getAwinPublisherId(),
    hasToken: Boolean(getAwinToken()),
    hasFeedListUrl: Boolean(getAwinFeedListUrl()),
    hasProductFeedDownloadUrl: Boolean(getAwinProductFeedDownloadUrl()),
    masterTag: "https://www.dwin2.com/pub.2843910.min.js",
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function pickRecordValue(record: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(record);
  for (const key of keys) {
    const direct = record[key];
    if (direct !== undefined && direct !== null && direct !== "") return toText(direct);

    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = entries.find(([entryKey]) => entryKey.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedKey);
    if (found?.[1] !== undefined && found[1] !== null && found[1] !== "") return toText(found[1]);
  }

  return "";
}

function normalizeFeed(record: Record<string, unknown>, index: number): NormalizedAwinFeed {
  const advertiserId = pickRecordValue(record, ["advertiserId", "merchantId", "programId", "programmeId"]);
  const advertiserName = pickRecordValue(record, ["advertiserName", "merchantName", "programName", "programmeName"]);
  const downloadUrl = pickRecordValue(record, ["downloadUrl", "url", "exampleUrl", "feedUrl"]);

  return {
    id: pickRecordValue(record, ["id", "feedId"]) || advertiserId || String(index + 1),
    name: pickRecordValue(record, ["name", "feedName", "title"]) || advertiserName || `Feed ${index + 1}`,
    advertiserId,
    advertiserName,
    language: pickRecordValue(record, ["language", "locale"]),
    region: pickRecordValue(record, ["region", "country", "countryCode"]),
    lastUpdated: pickRecordValue(record, ["lastUpdated", "lastUpdate", "updatedAt"]),
    downloadUrl,
  };
}

function parseFeedList(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const payload = JSON.parse(trimmed) as unknown;
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown>)?.data)
        ? ((payload as Record<string, unknown>).data as unknown[])
        : Array.isArray((payload as Record<string, unknown>)?.feeds)
          ? ((payload as Record<string, unknown>).feeds as unknown[])
          : [];
    return records.map((record, index) => normalizeFeed(record as Record<string, unknown>, index));
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    return normalizeFeed(record, index);
  });
}

export async function fetchAwinFeedList() {
  const url = getAwinFeedListUrl();
  if (!url) {
    throw new Error("AWIN_PRODUCT_FEED_LIST_URL nao configurada no servidor.");
  }

  const parsed = new URL(url);
  if (parsed.hostname !== "ui.awin.com") {
    throw new Error("AWIN_PRODUCT_FEED_LIST_URL deve apontar para ui.awin.com.");
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json,text/csv,text/plain,*/*" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Lista de feeds AWIN retornou HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return parseFeedList(await response.text());
}

function parseBRLNumber(value: unknown) {
  const text = toText(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

const AWIN_CATEGORY_PT_BR: Record<string, string> = {
  "phones & telecommunications": "Telefones e Telecomunicacoes",
  "phone & telecommunications": "Telefones e Telecomunicacoes",
  "computer & office": "Informatica e Escritorio",
  "computers & office": "Informatica e Escritorio",
  "consumer electronics": "Eletronicos",
  "jewelry & watches": "Joias e Relogios",
  "jewellery & watches": "Joias e Relogios",
  "home & garden": "Casa e Jardim",
  clothing: "Roupas",
  "sports & entertainment": "Esportes e Lazer",
  "beauty & health": "Beleza e Saude",
  "toys & hobbies": "Brinquedos e Hobbies",
  "bags & shoes": "Bolsas e Calcados",
  "office supplies": "Materiais de Escritorio",
  "home appliances": "Eletrodomesticos",
  "automobiles & motorcycles": "Automoveis e Motocicletas",
  "mother & kids": "Mamae e Bebe",
  "tools": "Ferramentas",
  "security & protection": "Seguranca e Protecao",
  "lights & lighting": "Iluminacao",
  "furniture": "Moveis",
  "watches": "Relogios",
};

function formatUnmappedCategory(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|&|\/|-)/)
    .map((part) => {
      if (!/[a-z0-9]/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

function translateAwinCategory(value: string) {
  const category = toText(value);
  if (!category) return "Sem categoria";
  const normalized = category.toLowerCase().replace(/\s+/g, " ").trim();
  return AWIN_CATEGORY_PT_BR[normalized] ?? formatUnmappedCategory(category);
}

function forceAliExpressBrazilLink(value: string) {
  let next = toText(value);
  if (!next) return next;

  try {
    const parsed = new URL(next);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "aliexpress.com" || hostname.endsWith(".aliexpress.com")) {
      parsed.protocol = "https:";
      parsed.hostname = "pt.aliexpress.com";
      return parsed.toString();
    }
  } catch {
    // Fall back to string replacements for encoded or non-standard feed URLs.
  }

  const replacements: Array<[RegExp, string]> = [
    [/https:\/\/[^/?#]*\.aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/http:\/\/[^/?#]*\.aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/https:\/\/www\.aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/https:\/\/aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/http:\/\/www\.aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/http:\/\/aliexpress\.com/gi, "https://pt.aliexpress.com"],
    [/\/\/www\.aliexpress\.com/gi, "//pt.aliexpress.com"],
    [/\/\/aliexpress\.com/gi, "//pt.aliexpress.com"],
    [/https%3A%2F%2F[^%/?#]*\.aliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
    [/http%3A%2F%2F[^%/?#]*\.aliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
    [/https%3A%2F%2Fwww\.aliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
    [/https%3A%2F%2Faliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
    [/http%3A%2F%2Fwww\.aliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
    [/http%3A%2F%2Faliexpress\.com/gi, "https%3A%2F%2Fpt.aliexpress.com"],
  ];

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

function recursivelyDecodeUrl(value: string) {
  let next = toText(value);
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(next);
      if (decoded === next) break;
      next = decoded;
    } catch {
      break;
    }
  }
  return next;
}

function extractAliExpressItemId(value: string) {
  const decoded = recursivelyDecodeUrl(value).toLowerCase();
  return (
    decoded.match(/\/item\/(\d{8,})/i)?.[1] ||
    decoded.match(/[?&](?:productid|itemid|item_id)=([0-9]{8,})/i)?.[1] ||
    decoded.match(/\b(1005\d{8,})\b/i)?.[1] ||
    ""
  );
}

function getAwinDestinationUrl(value: string) {
  const rawValue = toText(value);
  if (!rawValue) return "";

  try {
    const parsed = new URL(rawValue);
    const embeddedDestination = parsed.searchParams.get("ued");
    if (parsed.hostname.toLowerCase().endsWith("awin1.com") && embeddedDestination) {
      return getAwinDestinationUrl(recursivelyDecodeUrl(embeddedDestination));
    }

    const isAliExpressDeepLink =
      parsed.hostname.toLowerCase().endsWith("aliexpress.com") &&
      parsed.pathname.toLowerCase().includes("deep_link");
    const targetUrl = parsed.searchParams.get("dl_target_url");
    if (isAliExpressDeepLink && targetUrl) {
      return recursivelyDecodeUrl(targetUrl);
    }
  } catch {
    // Keep the raw value when the feed sends a non-standard but usable URL.
  }

  return rawValue;
}

function buildAwinDeepLink(params: {
  advertiserId: string;
  publisherId: string;
  destinationUrl: string;
}) {
  const destinationUrl = forceAliExpressBrazilLink(params.destinationUrl);
  if (!destinationUrl) return "";

  return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(
    params.advertiserId,
  )}&awinaffid=${encodeURIComponent(params.publisherId)}&ued=${encodeURIComponent(destinationUrl)}`;
}

function buildAwinSearchNeedles(value: string) {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return [];

  const needles = new Set<string>([normalized]);
  const stopWords = new Set(["https", "http", "www", "com", "html", "item", "pt", "br"]);

  try {
    const parsed = new URL(normalized);
    const destinationUrl = parsed.searchParams.get("ued");
    if (destinationUrl) {
      needles.add(destinationUrl.toLowerCase());
      needles.add(forceAliExpressBrazilLink(destinationUrl).toLowerCase());
    }
    needles.add(parsed.pathname.toLowerCase());
  } catch {
    // Non-URL searches are handled by tokenization below.
  }

  for (const match of normalized.matchAll(/\d{6,}/g)) {
    needles.add(match[0]);
  }

  normalized
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4 && !stopWords.has(token))
    .slice(0, 12)
    .forEach((token) => needles.add(token));

  return Array.from(needles).filter(Boolean);
}

function matchesAwinSearch(haystack: string, search: string) {
  const normalizedSearch = toText(search).toLowerCase();
  if (!normalizedSearch) return true;
  if (haystack.includes(normalizedSearch)) return true;

  const itemId = extractAliExpressItemId(normalizedSearch);
  if (itemId) {
    return haystack.includes(itemId);
  }

  const needles = buildAwinSearchNeedles(normalizedSearch);
  if (normalizedSearch.includes("://")) {
    const specificNeedles = needles.filter(
      (needle) => needle.length >= 12 || needle.includes("/item/"),
    );
    return specificNeedles.length > 0 && specificNeedles.some((needle) => haystack.includes(needle));
  }

  const numericNeedles = needles.filter((needle) => /^\d{8,}$/.test(needle));
  if (numericNeedles.length > 0) {
    return numericNeedles.some((needle) => haystack.includes(needle));
  }

  return needles.length > 0 && needles.every((needle) => haystack.includes(needle));
}

const FALLBACK_BRL_RATES: Record<string, number> = {
  BRL: 1,
  USD: 5.1,
  CNY: 0.71,
  EUR: 5.55,
  GBP: 6.45,
};

let awinBrlRatesCache:
  | {
      expiresAt: number;
      rates: Record<string, number>;
    }
  | null = null;

async function fetchAwinBrlRates() {
  if (awinBrlRatesCache && awinBrlRatesCache.expiresAt > Date.now()) {
    return awinBrlRatesCache.rates;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/BRL", {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json()) as { rates?: Record<string, number> };
    const rates = payload.rates ?? {};
    awinBrlRatesCache = {
      expiresAt: Date.now() + 30 * 60 * 1000,
      rates,
    };
    return rates;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function convertToBrl(value: number, currency: string, rates: Record<string, number>) {
  const normalizedCurrency = currency.toUpperCase();
  if (!value || normalizedCurrency === "BRL") return value;

  const rateFromBrl = rates[normalizedCurrency];
  if (rateFromBrl && rateFromBrl > 0) {
    return Number((value / rateFromBrl).toFixed(2));
  }

  const fallbackRate = FALLBACK_BRL_RATES[normalizedCurrency];
  return fallbackRate ? Number((value * fallbackRate).toFixed(2)) : value;
}

function normalizeAdvertiserFeedProduct(
  record: Record<string, unknown>,
  brlRates: Record<string, number>,
  advertiserId: string,
): NormalizedAwinAdvertiserFeedProduct | null {
  const id = pickRecordValue(record, ["aw_product_id", "awProductId", "product_id", "id"]);
  const productName = pickRecordValue(record, ["product_name", "productName", "name"]);
  const rawAwDeepLink = pickRecordValue(record, ["aw_deep_link", "awDeepLink", "deep_link"]);
  const merchantDeepLink = pickRecordValue(record, ["merchant_deep_link", "merchantDeepLink"]);
  const destinationUrl = forceAliExpressBrazilLink(
    getAwinDestinationUrl(merchantDeepLink || rawAwDeepLink),
  );
  const awDeepLink = buildAwinDeepLink({
    advertiserId,
    publisherId: getAwinPublisherId(),
    destinationUrl,
  });
  const originalSearchPrice = parseBRLNumber(
    pickRecordValue(record, ["search_price", "searchPrice", "price"]),
  );
  const originalCurrency = (pickRecordValue(record, ["currency"]) || "BRL").toUpperCase();
  const searchPrice = convertToBrl(originalSearchPrice, originalCurrency, brlRates);
  const categoryName = translateAwinCategory(
    pickRecordValue(record, ["category_name", "categoryName"]) || "Sem categoria",
  );
  const rating = parseBRLNumber(
    pickRecordValue(record, ["average_rating", "averageRating", "rating", "review_rating", "star_rating"]),
  );

  if (!id || !productName || !awDeepLink || originalSearchPrice <= 0 || searchPrice <= 0) {
    return null;
  }

  return {
    id,
    productName,
    description: pickRecordValue(record, ["description"]),
    merchantProductId: pickRecordValue(record, [
      "merchant_product_id",
      "merchantProductId",
    ]),
    merchantImageUrl: pickRecordValue(record, [
      "merchant_image_url",
      "merchantImageUrl",
      "aw_image_url",
      "awImageUrl",
    ]),
    awDeepLink,
    merchantDeepLink: destinationUrl,
    searchPrice,
    currency: "BRL",
    originalSearchPrice,
    originalCurrency,
    merchantName: pickRecordValue(record, ["merchant_name", "merchantName"]) || "AWIN",
    categoryName,
    rating,
  };
}

async function fetchTextOrGzipText(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json,text/csv,text/plain,*/*" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Feed AWIN retornou HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const isGzip =
    response.headers.get("content-type")?.toLowerCase().includes("gzip") ||
    (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return isGzip ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
}

async function fetchAwinAdvertiserFeeds(advertiserId: string) {
  const apiKey = getAwinDatafeedApiKey();
  if (!apiKey) {
    throw new Error("AWIN datafeed API key nao configurada no servidor.");
  }

  const url = new URL(
    `https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(
      apiKey,
    )}/language/pt/fid/${encodeURIComponent(
      advertiserId,
    )}/columns/${AWIN_ADVERTISER_FEED_COLUMNS}/format/json/`,
  );
  const feeds = parseFeedList(await fetchTextOrGzipText(url.toString()));
  return feeds.filter((feed) => feed.advertiserId === advertiserId && feed.downloadUrl);
}

function getFeedDownloadUrl(feed: NormalizedAwinFeed, params: { search: string; category: string; page: number }) {
  const apiKey = getAwinDatafeedApiKey();
  const language = feed.downloadUrl.match(/\/language\/([^/]+)/)?.[1] || "en";
  const url = new URL(
    `https://productdata.awin.com/datafeed/download/apikey/${encodeURIComponent(
      apiKey,
    )}/fid/${encodeURIComponent(
      feed.id,
    )}/format/csv/language/${encodeURIComponent(
      language,
    )}/delimiter/%2C/compression/gzip/adultcontent/1/columns/${AWIN_ADVERTISER_FEED_COLUMNS}/`,
  );

  // AWIN datafeed URLs are path-based, but keeping these as query params
  // preserves the request intent and allows the provider to honor filters if supported.
  if (params.search) url.searchParams.set("search", params.search);
  if (params.category) url.searchParams.set("category", params.category);
  url.searchParams.set("page", String(params.page));

  return url.toString();
}

export async function fetchAwinAdvertiserFeedProducts(params: {
  advertiserId: string;
  search?: string;
  category?: string;
  page?: number;
  sort?: AwinAdvertiserFeedSort;
  priceMin?: number | null;
  priceMax?: number | null;
}) {
  const advertiserId = toText(params.advertiserId);
  if (!/^\d+$/.test(advertiserId)) {
    throw new Error("advertiserId AWIN invalido.");
  }

  const page = Math.max(1, Number(params.page) || 1);
  const search = toText(params.search);
  const category = toText(params.category);
  const sort = toText(params.sort) as AwinAdvertiserFeedSort;
  const searchLower = search.toLowerCase();
  const categoryLower = category.toLowerCase();
  const normalizedPriceMin = normalizeOptionalNumber(params.priceMin);
  const normalizedPriceMax = normalizeOptionalNumber(params.priceMax);
  const priceMin = normalizedPriceMin === null ? null : Math.max(0, normalizedPriceMin);
  const priceMax =
    normalizedPriceMax === null ? null : Math.max(priceMin ?? 0, normalizedPriceMax);
  const startIndex = (page - 1) * AWIN_ADVERTISER_FEED_PAGE_SIZE;
  const endIndex = startIndex + AWIN_ADVERTISER_FEED_PAGE_SIZE;
  const feeds = await fetchAwinAdvertiserFeeds(advertiserId);
  const categories = Array.from(
    new Set(feeds.map((feed) => translateAwinCategory(feed.name)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const candidateFeeds = categoryLower
    ? feeds.filter((feed) =>
        `${feed.name} ${translateAwinCategory(feed.name)} ${feed.advertiserName}`
          .toLowerCase()
          .includes(categoryLower),
      )
    : feeds;
  const products: NormalizedAwinAdvertiserFeedProduct[] = [];
  const sortableProducts: NormalizedAwinAdvertiserFeedProduct[] = [];
  const shouldSort = sort === "best_deals" || sort === "top_selling";
  const brlRates = await fetchAwinBrlRates();
  let total = 0;

  for (const feed of candidateFeeds) {
    const text = await fetchTextOrGzipText(getFeedDownloadUrl(feed, { search, category, page }));
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) continue;

    const headers = parseCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const product = normalizeAdvertiserFeedProduct(record, brlRates, advertiserId);
      if (!product) continue;

      const haystack = `${product.id} ${product.merchantProductId} ${product.productName} ${product.description} ${product.merchantName} ${product.categoryName} ${product.awDeepLink} ${product.merchantDeepLink}`.toLowerCase();
      if (searchLower && !matchesAwinSearch(haystack, searchLower)) continue;
      if (categoryLower && !`${translateAwinCategory(feed.name)} ${product.categoryName}`.toLowerCase().includes(categoryLower)) continue;
      if (priceMin !== null && product.searchPrice < priceMin) continue;
      if (priceMax !== null && product.searchPrice > priceMax) continue;

      if (shouldSort) {
        sortableProducts.push(product);
      } else {
        if (total >= startIndex && total < endIndex) {
          products.push(product);
        }
        total += 1;
      }
    }
  }

  if (shouldSort) {
    const sortedProducts = sortableProducts.slice();
    if (sort === "best_deals") {
      sortedProducts.sort((a, b) => a.searchPrice - b.searchPrice);
    } else if (sort === "top_selling" && sortedProducts.some((product) => product.rating > 0)) {
      sortedProducts.sort((a, b) => b.rating - a.rating);
    }

    total = sortedProducts.length;
    products.push(...sortedProducts.slice(startIndex, endIndex));
  }

  return {
    products,
    total,
    page,
    categories,
  };
}

function normalizeProduct(record: Record<string, unknown>): NormalizedAwinProduct | null {
  const id = pickRecordValue(record, ["aw_product_id", "awProductId", "product_id"]);
  const name = pickRecordValue(record, ["product_name", "productName", "name"]);
  const deepLink = pickRecordValue(record, ["aw_deep_link", "awDeepLink", "deep_link"]);
  const merchantDeepLink = pickRecordValue(record, ["merchant_deep_link", "merchantDeepLink"]);
  const merchantId = pickRecordValue(record, ["merchant_id", "merchantId"]);
  const price = parseBRLNumber(pickRecordValue(record, ["search_price", "store_price", "price"]));

  if (!id || !name || !deepLink || price <= 0) return null;

  return {
    id,
    name,
    merchantProductId: pickRecordValue(record, ["merchant_product_id", "merchantProductId"]),
    merchantId,
    merchantName: pickRecordValue(record, ["merchant_name", "merchantName"]) || "AWIN",
    categoryName: pickRecordValue(record, ["category_name", "categoryName", "merchant_category"]),
    categoryId: pickRecordValue(record, ["category_id", "categoryId"]),
    price,
    displayPrice: pickRecordValue(record, ["display_price", "displayPrice"]) || String(price),
    currency: pickRecordValue(record, ["currency"]) || "BRL",
    imageUrl: pickRecordValue(record, ["aw_image_url", "merchant_image_url", "awImageUrl"]),
    description: pickRecordValue(record, ["description"]),
    deepLink,
    merchantDeepLink,
    lastUpdated: pickRecordValue(record, ["last_updated", "lastUpdated"]),
  };
}

export async function fetchAwinProductFeedProducts(params: {
  search?: string;
  limit?: number;
}) {
  const url = getAwinProductFeedDownloadUrl();
  if (!url) {
    throw new Error("AWIN_PRODUCT_FEED_DOWNLOAD_URL nao configurada no servidor.");
  }

  const parsed = new URL(url);
  if (parsed.hostname !== "productdata.awin.com") {
    throw new Error("AWIN_PRODUCT_FEED_DOWNLOAD_URL deve apontar para productdata.awin.com.");
  }

  const response = await fetch(url, {
    headers: { Accept: "text/csv,text/plain,*/*" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Feed de produtos AWIN retornou HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const lines = (await response.text()).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]);
  const search = toText(params.search).toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const products: NormalizedAwinProduct[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const product = normalizeProduct(record);
    if (!product) continue;

    const haystack = `${product.name} ${product.merchantName} ${product.categoryName}`.toLowerCase();
    if (search && !haystack.includes(search)) continue;

    products.push(product);
    if (products.length >= limit) break;
  }

  return products;
}

export async function fetchAwinProgrammes(params: {
  relationship?: string;
  countryCode?: string;
  includeHidden?: boolean;
}) {
  const publisherId = getAwinPublisherId();
  const payload = await awinFetch(`/publishers/${publisherId}/programmes`, undefined, {
    relationship: params.relationship || "joined",
    countryCode: params.countryCode,
    includeHidden: params.includeHidden,
  });
  const programmes = Array.isArray(payload)
    ? payload.map((item) => normalizeProgramme(item as AwinProgramme)).filter(Boolean)
    : [];

  return programmes as NormalizedAwinProgramme[];
}

export async function fetchAwinAdvertisers(countryCode?: string) {
  const programmes = await fetchAwinProgrammes({
    relationship: "joined",
    countryCode: countryCode || undefined,
  });

  return programmes.map((programme) => ({
    id: programme.id,
    name: programme.name,
    logoUrl: programme.logoUrl,
  })) satisfies NormalizedAwinAdvertiser[];
}

export async function fetchAwinOffers(params: {
  page?: number;
  pageSize?: number;
  membership?: "joined" | "notJoined" | "all";
  status?: "active" | "expiringSoon" | "upcoming";
  type?: "promotion" | "voucher" | "all";
  regionCode?: string;
  advertiserId?: string;
}) {
  const publisherId = getAwinPublisherId();
  const advertiserIds = params.advertiserId ? [Number(params.advertiserId)] : undefined;
  const payload = await awinFetch(`/publisher/${publisherId}/promotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters: {
        membership: params.membership || "joined",
        status: params.status || "active",
        type: params.type || "all",
        regionCodes: params.regionCode ? [params.regionCode] : undefined,
        advertiserIds,
      },
      pagination: {
        page: Math.max(1, params.page ?? 1),
        pageSize: Math.min(Math.max(params.pageSize ?? 20, 10), 200),
      },
    }),
  });

  const rawOffers = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.data)
      ? ((payload as Record<string, unknown>).data as unknown[])
      : Array.isArray((payload as Record<string, unknown>)?.promotions)
        ? ((payload as Record<string, unknown>).promotions as unknown[])
        : [];

  return rawOffers.map((item) => normalizeOffer(item as AwinOffer)).filter(Boolean) as NormalizedAwinOffer[];
}

export async function generateAwinLink(params: {
  advertiserId: string;
  destinationUrl: string;
  campaign?: string;
  clickref?: string;
  shorten?: boolean;
}) {
  const publisherId = getAwinPublisherId();
  const payload = (await awinFetch(`/publishers/${publisherId}/linkbuilder/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      advertiserId: Number(params.advertiserId),
      destinationUrl: params.destinationUrl,
      parameters: {
        campaign: params.campaign || "radar-smart",
        clickref: params.clickref || "radar-smart",
      },
      shorten: params.shorten ?? true,
    }),
  })) as Record<string, unknown>;

  return {
    url: toText(payload.url),
    shortUrl: toText(payload.shortUrl),
  };
}
