export type AmazonProduct = {
  asin: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  rating: number;
  reviews: number;
  product_url: string;
  affiliate_url: string;
  is_prime?: boolean;
  is_best_seller?: boolean;
  badges?: string[];
  raw?: Record<string, unknown>;
};

const DEFAULT_AMAZON_TAG = "radarsmart202-20";
const AMAZON_IMAGE_FALLBACK = "";

type AmazonApiProduct = {
  asin?: string | null;
  product_title?: string | null;
  product_price?: string | null;
  product_original_price?: string | null;
  product_photo?: string | null;
  product_star_rating?: number | string | null;
  product_num_ratings?: number | string | null;
  is_prime?: boolean | null;
  is_best_seller?: boolean | null;
  badges?: string[] | null;
  product_badges?: string[] | null;
  [key: string]: unknown;
};

type AmazonApiResponse = {
  data?: {
    products?: AmazonApiProduct[] | null;
  } | null;
};

export const parseCurrencyToNumber = (raw?: string | null) => {
  if (!raw) return 0;
  const normalized = raw
    .replace(/\s/g, "")
    .replace(/[Rr]\$/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
};

function decodePossibleEscapedUrl(raw?: string | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/gi, "&");
}

function normalizeAbsoluteUrl(raw?: string | null): string {
  const value = decodePossibleEscapedUrl(raw);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  if (/^www\./i.test(value)) return `https://${value}`;
  return "";
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildAmazonImageCandidates(raw?: string | null): string[] {
  const absolute = normalizeAbsoluteUrl(raw);
  if (!absolute) return [];

  const noHash = absolute.split("#")[0];
  const noQuery = noHash.split("?")[0];
  const withSy450 = noHash
    .replace(/_AC_SL1500_/gi, "_AC_SY450_")
    .replace(/\._AC_[A-Z0-9,]+_\./gi, "._AC_SY450_.");
  const withSy450NoQuery = withSy450.split("?")[0];
  const withOriginal = noHash.replace(/\._[A-Z0-9,]+_\./gi, ".");
  const withOriginalNoQuery = withOriginal.split("?")[0];

  return dedupeStrings([
    withOriginal,
    withOriginalNoQuery,
    noHash,
    noQuery,
    withSy450,
    withSy450NoQuery,
  ]);
}

export function normalizeAmazonImageUrl(raw?: string | null): string {
  const [best] = buildAmazonImageCandidates(raw);
  return best || AMAZON_IMAGE_FALLBACK;
}

export const normalizeAmazonProducts = (
  data: AmazonApiResponse | null | undefined,
  tag = "radarsmart202-20",
): AmazonProduct[] => {
  const items = data?.data?.products ?? [];
  return items.slice(0, 10).map((p) => {
    const asin = String(p.asin ?? "");
    const badges = [
      ...(Array.isArray(p.badges) ? p.badges : []),
      ...(Array.isArray(p.product_badges) ? p.product_badges : []),
    ]
      .map((badge) => String(badge).trim())
      .filter(Boolean);

    return {
      asin,
      title: String(p.product_title ?? ""),
      price: parseCurrencyToNumber(p.product_price),
      original_price: parseCurrencyToNumber(p.product_original_price),
      image_url: normalizeAmazonImageUrl(String(p.product_photo ?? "")),
      rating: Number(p.product_star_rating ?? 0),
      reviews: Number(p.product_num_ratings ?? 0),
      product_url: `https://www.amazon.com.br/dp/${asin}`,
      affiliate_url: `https://www.amazon.com.br/dp/${asin}?tag=${tag}`,
      is_prime: Boolean(p.is_prime),
      is_best_seller: Boolean(p.is_best_seller),
      badges,
      raw: p,
    };
  });
};

function ensureAbsoluteUrl(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return "";
}

function extractAmazonAsinFromPath(pathname: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
  ];
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export function sanitizeAmazonUrl(
  rawUrl?: string | null,
  tag: string | null = DEFAULT_AMAZON_TAG,
): string {
  const absolute = ensureAbsoluteUrl(rawUrl);
  if (!absolute) return "";

  try {
    const parsed = new URL(absolute);
    parsed.hash = "";
    const host = parsed.hostname.toLowerCase();

    // Suporte para redirecionamentos curtos (amzn.to) e normalização em tag
    if (host.includes("amzn.to")) {
      const asin = extractAmazonAsinFromPath(parsed.pathname);
      if (asin) {
        const clean = new URL(`https://www.amazon.com.br/dp/${asin}`);
        if (tag) clean.searchParams.set("tag", tag);
        return clean.toString();
      }
      if (tag) parsed.searchParams.set("tag", tag);
      return parsed.toString();
    }

    if (!host.includes("amazon.")) {
      if (tag) parsed.searchParams.set("tag", tag);
      return parsed.toString();
    }

    const asin = extractAmazonAsinFromPath(parsed.pathname);
    if (asin) {
      const clean = new URL(`https://www.amazon.com.br/dp/${asin}`);
      if (tag) clean.searchParams.set("tag", tag);
      return clean.toString();
    }

    if (tag) parsed.searchParams.set("tag", tag);
    return parsed.toString();
  } catch {
    return absolute;
  }
}

export function sanitizeMarketplaceUrl(
  url?: string | null,
  marketplace?: string | null,
  options?: { fallbackUrl?: string | null; amazonTag?: string },
): string {
  const market = String(marketplace ?? "").toLowerCase();
  const candidate = ensureAbsoluteUrl(url) || ensureAbsoluteUrl(options?.fallbackUrl);
  if (!candidate) return "";

  if (market.includes("amazon") || candidate.toLowerCase().includes("amazon.")) {
    return sanitizeAmazonUrl(candidate, options?.amazonTag || DEFAULT_AMAZON_TAG);
  }

  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return candidate;
  }
}
