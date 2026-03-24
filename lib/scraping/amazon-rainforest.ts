import { load } from "cheerio";
import { fetchHtmlWithRotation } from "@/lib/scraping/http-fetch-rotator";

type AmazonRainforestInput = {
  url: string;
  affiliateUrl?: string | null;
};

export type AmazonRainforestPreview = {
  asin: string | null;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  image_url: string;
  productUrl: string;
  product_url: string;
  affiliateUrl: string;
  affiliate_url: string;
  rawData: Record<string, unknown>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toAbsoluteHttpUrl(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPrice(node: Record<string, unknown> | undefined): number | null {
  if (!node) return null;
  return (
    toNumber(node.value) ??
    toNumber(node.amount) ??
    toNumber(node.raw) ??
    toNumber(node.display_price)
  );
}

function extractAsinFromUrl(url: string): string | null {
  const source = toText(url).toUpperCase();
  if (!source) return null;

  const patterns = [
    /\/DP\/([A-Z0-9]{10})(?:[/?]|$)/,
    /\/GP\/PRODUCT\/([A-Z0-9]{10})(?:[/?]|$)/,
    /\/PRODUCT\/([A-Z0-9]{10})(?:[/?]|$)/,
    /[?&]ASIN=([A-Z0-9]{10})(?:[&#]|$)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function isAmazonImageHost(value: string): boolean {
  const lower = toText(value).toLowerCase();
  return (
    lower.includes("media-amazon.com") ||
    lower.includes("ssl-images-amazon.com") ||
    lower.includes("images-amazon.com")
  );
}

function readGalleryImageCandidate(
  item: Record<string, unknown> | string | undefined,
): string {
  if (!item) return "";
  if (typeof item === "string") return toAbsoluteHttpUrl(item);

  const possible = [
    item.link,
    item.url,
    item.image,
    item.large,
    item.main,
    item.hi_res,
    item.hires,
    item.src,
  ];

  for (const candidate of possible) {
    const absolute = toAbsoluteHttpUrl(candidate);
    if (absolute) return absolute;
  }

  return "";
}

function pickMainImageFromProductNode(product: Record<string, unknown>): string {
  if (!product || Object.keys(product).length === 0) return "";

  const mainImage = (product.main_image ?? {}) as Record<string, unknown>;
  const strictMainImageLink = toAbsoluteHttpUrl(mainImage.link);
  if (isValidAmazonProductImage(strictMainImageLink)) {
    return strictMainImageLink;
  }

  return "";
}

function pickGalleryImageFromProductNode(product: Record<string, unknown>): string {
  if (!product || Object.keys(product).length === 0) return "";

  const galleryImages = Array.isArray(product.images)
    ? (product.images as Array<Record<string, unknown> | string>)
    : [];

  const firstGallery = galleryImages[0];
  const firstGalleryLink = readGalleryImageCandidate(firstGallery);
  if (isValidAmazonProductImage(firstGalleryLink)) {
    return firstGalleryLink;
  }

  for (const item of galleryImages) {
    const candidateLink = readGalleryImageCandidate(item);
    if (isValidAmazonProductImage(candidateLink)) {
      return candidateLink;
    }
  }

  return "";
}

function parseAmazonDynamicImageAttribute(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";

  const parseCandidates = [
    raw,
    raw.replace(/&quot;/g, '"'),
    raw.replace(/\\"/g, '"'),
    raw.replace(/&quot;/g, '"').replace(/\\"/g, '"'),
  ];

  for (const candidate of parseCandidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const firstImageKey = Object.keys(parsed)[0] ?? "";
      const firstImageUrl = toAbsoluteHttpUrl(firstImageKey);
      if (isValidAmazonProductImage(firstImageUrl)) {
        return firstImageUrl;
      }
    } catch {
      // Continua tentando as variações de parsing.
    }
  }

  return "";
}

function pickLandingImageFromHtml(html: string): string {
  if (!toText(html)) return "";

  const $ = load(html);
  const landingImage = $("#landingImage").first();

  // Regra solicitada: prioriza data-a-dynamic-image (JSON -> primeira chave URL).
  const dynamicImageRaw = toText(landingImage.attr("data-a-dynamic-image"));
  const imageFromDynamicJson = parseAmazonDynamicImageAttribute(dynamicImageRaw);
  if (imageFromDynamicJson) {
    return imageFromDynamicJson;
  }

  // Fallback solicitado: data-old-hires.
  const imageFromOldHires = toAbsoluteHttpUrl(landingImage.attr("data-old-hires"));
  if (isValidAmazonProductImage(imageFromOldHires)) {
    return imageFromOldHires;
  }

  return "";
}

async function extractLandingImageFallbackFromPage(sourceUrl: string): Promise<string> {
  const asin = extractAsinFromUrl(sourceUrl);
  const candidateUrls = Array.from(
    new Set([sourceUrl, asin ? `https://www.amazon.com.br/dp/${asin}` : ""]),
  ).filter(Boolean) as string[];

  for (const candidateUrl of candidateUrls) {
    try {
      const snapshot = await fetchHtmlWithRotation({
        url: candidateUrl,
        timeoutMs: 12000,
        maxAttempts: 2,
        minHtmlLength: 1000,
        blockedPatterns: [
          /enter the characters you see below/i,
          /robot check/i,
          /captcha/i,
          /api-services-support@amazon.com/i,
        ],
      });

      const landingImage = pickLandingImageFromHtml(snapshot.html);
      if (landingImage) {
        return landingImage;
      }
    } catch {
      // Mantém resiliente e tenta a próxima URL candidata.
    }
  }

  return "";
}

function pickImageFromProductNode(product: Record<string, unknown>): string {
  return pickMainImageFromProductNode(product) || pickGalleryImageFromProductNode(product);
}

function isValidAmazonProductImage(value: string): boolean {
  const normalized = toAbsoluteHttpUrl(value).toLowerCase();
  if (!normalized) return false;
  if (!isHttpUrl(normalized)) return false;
  if (!isAmazonImageHost(normalized)) return false;

  if (
    normalized.includes("logo") ||
    normalized.includes("icon") ||
    normalized.includes("sprite") ||
    normalized.includes("favicon") ||
    normalized.includes("nav-logo")
  ) {
    return false;
  }

  return true;
}

function pickRainforestProductImage(payload: Record<string, unknown>): string {
  const dataNode = (payload.data ?? {}) as Record<string, unknown>;
  const dataProduct = (dataNode.product ?? {}) as Record<string, unknown>;

  // 1) Prioridade máxima: data.product.main_image.link + fallback da galeria data.product.images.
  const imageFromDataProduct = pickImageFromProductNode(dataProduct);
  if (imageFromDataProduct) {
    return imageFromDataProduct;
  }

  // 2) Compatibilidade: alguns payloads podem expor product na raiz.
  const rootProduct = (payload.product ?? {}) as Record<string, unknown>;
  const imageFromRootProduct = pickImageFromProductNode(rootProduct);
  if (imageFromRootProduct) {
    return imageFromRootProduct;
  }

  return "";
}

function pickRainforestMainImageStrict(payload: Record<string, unknown>): string {
  const dataNode = (payload.data ?? {}) as Record<string, unknown>;
  const dataProduct = (dataNode.product ?? {}) as Record<string, unknown>;

  const mainFromDataProduct = pickMainImageFromProductNode(dataProduct);
  if (mainFromDataProduct) {
    return mainFromDataProduct;
  }

  const rootProduct = (payload.product ?? {}) as Record<string, unknown>;
  const mainFromRootProduct = pickMainImageFromProductNode(rootProduct);
  if (mainFromRootProduct) {
    return mainFromRootProduct;
  }

  return "";
}

function pickRainforestGalleryImage(payload: Record<string, unknown>): string {
  const dataNode = (payload.data ?? {}) as Record<string, unknown>;
  const dataProduct = (dataNode.product ?? {}) as Record<string, unknown>;

  const galleryFromDataProduct = pickGalleryImageFromProductNode(dataProduct);
  if (galleryFromDataProduct) {
    return galleryFromDataProduct;
  }

  const rootProduct = (payload.product ?? {}) as Record<string, unknown>;
  const galleryFromRootProduct = pickGalleryImageFromProductNode(rootProduct);
  if (galleryFromRootProduct) {
    return galleryFromRootProduct;
  }

  return "";
}

export async function extractAmazonWithRainforest(
  input: AmazonRainforestInput,
): Promise<AmazonRainforestPreview> {
  const sourceUrl = toText(input.url);
  if (!sourceUrl) throw new Error("URL Amazon obrigatória.");

  const apiKey =
    toText(process.env.RAINFOREST_API_KEY) ||
    toText(process.env.RAINFORESTAPI_KEY) ||
    toText(process.env.RAINFOREST_API_TOKEN);
  if (!apiKey) {
    throw new Error("RAINFOREST_API_KEY não configurada.");
  }

  const endpoint = new URL("https://api.rainforestapi.com/request");
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("type", "product");
  endpoint.searchParams.set("amazon_domain", "amazon.com.br");

  const asinFromUrl = extractAsinFromUrl(sourceUrl);
  if (asinFromUrl) {
    endpoint.searchParams.set("asin", asinFromUrl);
  } else {
    endpoint.searchParams.set("url", sourceUrl);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const reason =
      toText(payload.message) || toText(payload.error) || `HTTP ${response.status}`;
    throw new Error(`Rainforest API falhou: ${reason}`);
  }

  const dataNode = (payload.data ?? {}) as Record<string, unknown>;
  const dataProduct = (dataNode.product ?? {}) as Record<string, unknown>;
  const rootProduct = (payload.product ?? {}) as Record<string, unknown>;
  const product =
    Object.keys(dataProduct).length > 0
      ? dataProduct
      : rootProduct;
  const buybox = (product.buybox_winner ?? {}) as Record<string, unknown>;
  const priceNode = (buybox.price ?? {}) as Record<string, unknown>;
  const rrpNode = (buybox.rrp ?? {}) as Record<string, unknown>;
  const basePriceNode = (product.base_price ?? {}) as Record<string, unknown>;

  const strictMainImageUrl = pickRainforestMainImageStrict(payload);
  const landingImageFallback = strictMainImageUrl
    ? ""
    : await extractLandingImageFallbackFromPage(sourceUrl);
  const rainforestGalleryImageUrl = strictMainImageUrl || landingImageFallback
    ? ""
    : pickRainforestGalleryImage(payload);

  // Ordem final (missão elite Amazon BR):
  // 1) data.product.main_image.link (estrito)
  // 2) #landingImage[data-a-dynamic-image] (primeira chave do JSON)
  // 3) #landingImage[data-old-hires]
  // 4) galeria Rainforest (fallback adicional de segurança)
  const imageUrl = strictMainImageUrl || landingImageFallback || rainforestGalleryImageUrl;
  const normalizedImageUrl = imageUrl;

  const productUrl = toText(product.link) || sourceUrl;
  const affiliateUrl = toText(input.affiliateUrl) || productUrl;

  const rawData: Record<string, unknown> = {
    ...payload,
    image_url: normalizedImageUrl,
    manual_landing_image_url: landingImageFallback,
    image_debug: {
      rainforest_main_image_strict: strictMainImageUrl,
      landing_image_fallback: landingImageFallback,
      rainforest_gallery_fallback: rainforestGalleryImageUrl,
      rainforest_legacy_pick: pickRainforestProductImage(payload),
    },
  };

  return {
    asin: toText(product.asin) || null,
    title: toText(product.title),
    price: readPrice(priceNode),
    oldPrice: readPrice(rrpNode) ?? readPrice(basePriceNode),
    imageUrl: normalizedImageUrl,
    image_url: normalizedImageUrl,
    productUrl,
    product_url: productUrl,
    affiliateUrl,
    affiliate_url: affiliateUrl,
    rawData,
  };
}