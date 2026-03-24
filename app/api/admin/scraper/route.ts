import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getValidToken } from "@/lib/supabase";
import { extractWithContainerEngine } from "@/lib/scraping/container-engine";
import { mapToAdminProdutoML } from "@/lib/scraping/mercadolivre-extractor";
import { mapToAdminProdutoAmazon } from "@/lib/scraping/amazon-extractor";
import { extractMercadoLivreOfficial } from "@/lib/scraping/mercadolivre-official";
import { extractMercadoLivreWithZenscrape } from "@/lib/scraping/mercadolivre-zenscrape";
import { extractAmazonWithRainforest } from "@/lib/scraping/amazon-rainforest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Marketplace = "mercadolivre" | "amazon";
type ExtractionStatus = "ok" | "partial_failure";
type ExtractionLayer =
  | "zenscrape_api"
  | "ml_api"
  | "rainforest_api"
  | "json_ld"
  | "open_graph"
  | "dom"
  | "mixed"
  | "none";

type DebugLayer = "rainforest" | "zenscrape" | "official" | "container" | "merged";

type ExtractPreviewPayload = {
  asin?: string | null;
  title: string;
  price: number;
  old_price: number;
  original_price: number;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  permalink?: string;
  condition?: string | null;
  status?: string | null;
};

type SuccessResponse = {
  success: true;
  status: ExtractionStatus;
  missing_fields: string[];
  marketplace: Marketplace;
  engine: string;
  extraction_layer: ExtractionLayer;
  elapsed_ms: number;
  title: string;
  price: number;
  old_price: number;
  image: string;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  preview: ExtractPreviewPayload;
  extracted: Record<string, unknown>;
  debug_info?: {
    layer_used: DebugLayer;
    missing_fields: string[];
    latency_ms: number;
  };
  error?: string;
};

type AmazonProductData = {
  asin: string | null;
  title: string;
  price: number | null;
  old_price: number | null;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  raw_data: Record<string, unknown>;
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toAbsoluteHttpUrl(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function isAmazonImageHost(value: string): boolean {
  const normalized = toText(value).toLowerCase();
  return (
    normalized.includes("media-amazon.com") ||
    normalized.includes("ssl-images-amazon.com") ||
    normalized.includes("images-amazon.com")
  );
}

function readAmazonGalleryImageCandidate(
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

function isValidAmazonProductImage(value: string): boolean {
  const normalized = toAbsoluteHttpUrl(value).toLowerCase();
  if (!normalized || !/^https?:\/\//i.test(normalized)) return false;

  if (!isAmazonImageHost(normalized)) {
    return false;
  }

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

function pickRainforestImageFromRaw(rawData: Record<string, unknown>): string {
  const dataNode = (rawData.data ?? {}) as Record<string, unknown>;
  const product = (dataNode.product ?? {}) as Record<string, unknown>;

  // Regra da refatoração: estritamente data.product.main_image.link.
  const mainImage = (product.main_image as Record<string, unknown> | undefined) ?? {};
  const strictMain = toAbsoluteHttpUrl(mainImage.link);
  if (isValidAmazonProductImage(strictMain)) {
    return strictMain;
  }

  // Fallback obrigatório: data.product.images[0].link.
  const galleryImages = Array.isArray(product.images)
    ? (product.images as Array<Record<string, unknown> | string>)
    : [];

  const firstGalleryItem = galleryImages[0];
  const firstGalleryLink = readAmazonGalleryImageCandidate(firstGalleryItem);
  if (isValidAmazonProductImage(firstGalleryLink)) {
    return firstGalleryLink;
  }

  // Se images[0] vier inválida, varre o restante da galeria.
  for (const item of galleryImages) {
    const candidateLink = readAmazonGalleryImageCandidate(item);
    if (isValidAmazonProductImage(candidateLink)) {
      return candidateLink;
    }
  }

  return "";
}

function normalizeAmazonProductData(
  amazon: Awaited<ReturnType<typeof extractAmazonWithRainforest>>,
): AmazonProductData {
  const camelImage = toAbsoluteHttpUrl(amazon.imageUrl);
  const snakeImage = toAbsoluteHttpUrl((amazon as { image_url?: unknown }).image_url);
  const rawData = amazon.rawData as Record<string, unknown>;
  const imageDebug = (rawData.image_debug ?? {}) as Record<string, unknown>;
  const manualLandingImage = toAbsoluteHttpUrl(rawData.manual_landing_image_url);
  const manualLandingImageDebug = toAbsoluteHttpUrl(imageDebug.landing_image_fallback);
  const fallbackFromRaw = pickRainforestImageFromRaw(amazon.rawData);

  // Garantia do fluxo Amazon: prioriza payload final e inclui fallback manual do #landingImage.
  const imageUrl =
    snakeImage ||
    camelImage ||
    manualLandingImage ||
    manualLandingImageDebug ||
    fallbackFromRaw;

  const camelProductUrl = toText(amazon.productUrl);
  const snakeProductUrl = toText((amazon as { product_url?: unknown }).product_url);
  const productUrl = snakeProductUrl || camelProductUrl;

  const camelAffiliateUrl = toText(amazon.affiliateUrl);
  const snakeAffiliateUrl = toText((amazon as { affiliate_url?: unknown }).affiliate_url);
  const affiliateUrl = snakeAffiliateUrl || camelAffiliateUrl || productUrl;

  return {
    asin: amazon.asin,
    title: toText(amazon.title),
    price: amazon.price,
    old_price: amazon.oldPrice,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    raw_data: amazon.rawData,
  };
}

function detectMarketplace(url: string, hint?: string): Marketplace | null {
  const hintNormalized = String(hint ?? "").toLowerCase().trim();
  if (hintNormalized === "mercadolivre" || hintNormalized === "amazon") {
    return hintNormalized;
  }

  const normalized = url.toLowerCase();
  if (
    normalized.includes("mercadolivre.") ||
    normalized.includes("mercadolibre.") ||
    normalized.includes("meli.la")
  ) {
    return "mercadolivre";
  }
  if (normalized.includes("amazon.") || normalized.includes("amzn.to")) {
    return "amazon";
  }
  return null;
}

function buildExtractionStatus(input: {
  title?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}): { status: ExtractionStatus; missing_fields: string[] } {
  const normalizedImageUrl = String(input.imageUrl ?? "").trim().toLowerCase();
  const validImage =
    Boolean(normalizedImageUrl) &&
    normalizedImageUrl !== "/logo.png" &&
    /^https?:\/\//i.test(normalizedImageUrl);

  const missing_fields: string[] = [];
  if (!String(input.title ?? "").trim()) missing_fields.push("title");
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    missing_fields.push("price");
  }
  if (!validImage) missing_fields.push("image_url");

  return {
    status: missing_fields.length > 0 ? "partial_failure" : "ok",
    missing_fields,
  };
}

function buildFromMercadoLivreOfficial(input: {
  elapsedMs: number;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  permalink: string;
  productUrl: string;
  affiliateUrl: string;
  condition?: string | null;
  status?: string | null;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    permalink: input.permalink,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    condition: input.condition ?? null,
    status: input.status ?? null,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "ml-official-v2",
    extraction_layer: "ml_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function isPositivePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeCommercialValues(
  price: number,
  oldPrice: number,
): { price: number; oldPrice: number } {
  const safePrice = isPositivePrice(price) ? price : 0;
  const safeOldPrice = isPositivePrice(oldPrice) ? oldPrice : 0;

  if (!safePrice && safeOldPrice) {
    return { price: safeOldPrice, oldPrice: 0 };
  }

  if (safeOldPrice > 0 && safeOldPrice <= safePrice) {
    return { price: safePrice, oldPrice: 0 };
  }

  return { price: safePrice, oldPrice: safeOldPrice };
}

function mergeMercadoLivrePayloads(
  zensPayload: SuccessResponse | null,
  officialPayload: SuccessResponse | null,
): SuccessResponse | null {
  if (!zensPayload && !officialPayload) return null;
  if (!zensPayload) return officialPayload;
  if (!officialPayload) return zensPayload;

  const price = isPositivePrice(officialPayload.price)
    ? officialPayload.price
    : zensPayload.price;

  const officialOldPrice = isPositivePrice(officialPayload.old_price)
    ? officialPayload.old_price
    : 0;
  const zensOldPrice = isPositivePrice(zensPayload.old_price)
    ? zensPayload.old_price
    : 0;

  const oldPrice =
    officialOldPrice > price
      ? officialOldPrice
      : zensOldPrice > price && zensOldPrice !== price
        ? zensOldPrice
        : 0;
  const normalizedCommercial = normalizeCommercialValues(price, oldPrice);

  const title = zensPayload.title || officialPayload.title;
  const imageUrl = zensPayload.image_url || officialPayload.image_url;
  const productUrl = officialPayload.product_url || zensPayload.product_url;
  const affiliateUrl = officialPayload.affiliate_url || zensPayload.affiliate_url;

  const validation = buildExtractionStatus({
    title,
    price,
    imageUrl,
  });

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "ml-merged-v1",
    extraction_layer: "mixed",
    elapsed_ms: Math.max(zensPayload.elapsed_ms, officialPayload.elapsed_ms),
    title,
    price: normalizedCommercial.price,
    old_price: normalizedCommercial.oldPrice,
    image: imageUrl,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    preview: {
      title,
      price: normalizedCommercial.price,
      old_price: normalizedCommercial.oldPrice,
      original_price: normalizedCommercial.oldPrice,
      image_url: imageUrl,
      permalink:
        toText((officialPayload.preview as { permalink?: unknown } | undefined)?.permalink) ||
        toText((zensPayload.preview as { permalink?: unknown } | undefined)?.permalink),
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      condition:
        toText((officialPayload.preview as { condition?: unknown } | undefined)?.condition) ||
        null,
      status:
        toText((officialPayload.preview as { status?: unknown } | undefined)?.status) ||
        null,
    },
    extracted: {
      zenscrape: zensPayload.extracted,
      official: officialPayload.extracted,
      merged_price_source: isPositivePrice(officialPayload.price) ? "official" : "zenscrape",
      merged_old_price_source:
        officialOldPrice > normalizedCommercial.price
          ? "official"
          : zensOldPrice > normalizedCommercial.price &&
              zensOldPrice !== normalizedCommercial.price
            ? "zenscrape"
            : "none",
    },
  };
}

function buildFromMercadoLivreZenscrape(input: {
  elapsedMs: number;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "mercadolivre",
    engine: "zenscrape-v1",
    extraction_layer: "zenscrape_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function buildFromAmazonRainforest(input: {
  elapsedMs: number;
  asin: string | null;
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  affiliateUrl: string;
  rawData: Record<string, unknown>;
}): SuccessResponse {
  const validation = buildExtractionStatus({
    title: input.title,
    price: input.price,
    imageUrl: input.imageUrl,
  });

  const preview = {
    asin: input.asin,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    original_price: input.oldPrice ?? 0,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
  };

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "amazon",
    engine: "rainforest-v1",
    extraction_layer: "rainforest_api",
    elapsed_ms: input.elapsedMs,
    title: input.title,
    price: input.price ?? 0,
    old_price: input.oldPrice ?? 0,
    image: input.imageUrl,
    image_url: input.imageUrl,
    product_url: input.productUrl,
    affiliate_url: input.affiliateUrl,
    preview,
    extracted: input.rawData,
  };
}

function buildFromContainerFallback(
  extractedEngine: Awaited<ReturnType<typeof extractWithContainerEngine>>,
): SuccessResponse {
  if (extractedEngine.marketplace === "mercadolivre") {
    const extracted = extractedEngine.data;
    const preview = mapToAdminProdutoML(extracted);
    const previewPayload: ExtractPreviewPayload = {
      title: preview.title,
      price: preview.price,
      old_price: preview.original_price,
      original_price: preview.original_price,
      image_url: preview.image_url,
      product_url: preview.product_url,
      affiliate_url: preview.affiliate_url,
    };
    const validation = buildExtractionStatus({
      title: preview.title,
      price: preview.price,
      imageUrl: preview.image_url,
    });

    return {
      success: true,
      status: validation.status,
      missing_fields: validation.missing_fields,
      marketplace: "mercadolivre",
      engine: extractedEngine.engine,
      extraction_layer: extracted.extractionLayer as ExtractionLayer,
      elapsed_ms: extractedEngine.elapsedMs,
      title: preview.title,
      price: preview.price,
      old_price: preview.original_price,
      image: preview.image_url,
      image_url: preview.image_url,
      product_url: preview.product_url,
      affiliate_url: preview.affiliate_url,
      preview: previewPayload,
      extracted: extracted as unknown as Record<string, unknown>,
    };
  }

  const extracted = extractedEngine.data;
  const preview = mapToAdminProdutoAmazon(extracted);
  const previewPayload: ExtractPreviewPayload = {
    asin: extracted.asin,
    title: preview.title,
    price: preview.price,
    old_price: preview.original_price,
    original_price: preview.original_price,
    image_url: preview.image_url,
    product_url: preview.product_url,
    affiliate_url: preview.affiliate_url,
  };
  const validation = buildExtractionStatus({
    title: preview.title,
    price: preview.price,
    imageUrl: preview.image_url,
  });

  return {
    success: true,
    status: validation.status,
    missing_fields: validation.missing_fields,
    marketplace: "amazon",
    engine: extractedEngine.engine,
    extraction_layer: extracted.extractionLayer as ExtractionLayer,
    elapsed_ms: extractedEngine.elapsedMs,
    title: preview.title,
    price: preview.price,
    old_price: preview.original_price,
    image: preview.image_url,
    image_url: preview.image_url,
    product_url: preview.product_url,
    affiliate_url: preview.affiliate_url,
    preview: previewPayload,
    extracted: extracted as unknown as Record<string, unknown>,
  };
}

function buildManualFallbackResponse(input: {
  marketplace: Marketplace;
  sourceUrl: string;
  affiliateUrl: string;
  errorMessage: string;
}): SuccessResponse {
  return {
    success: true,
    status: "partial_failure",
    missing_fields: ["title", "price", "image_url"],
    marketplace: input.marketplace,
    engine: "manual-fallback",
    extraction_layer: "none",
    elapsed_ms: 0,
    title: "",
    price: 0,
    old_price: 0,
    image: "",
    image_url: "",
    product_url: input.sourceUrl,
    affiliate_url: input.affiliateUrl,
    preview: {
      title: "",
      price: 0,
      old_price: 0,
      original_price: 0,
      image_url: "",
      product_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl,
    },
    extracted: {},
    error: input.errorMessage,
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json()) as {
      url?: string;
      affiliate_url?: string | null;
      marketplace?: string;
    };

    const sourceUrl = String(body?.url ?? "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ error: "Campo url obrigatorio." }, { status: 400 });
    }

    const affiliateUrl = String(body?.affiliate_url ?? sourceUrl).trim() || sourceUrl;
    const marketplace = detectMarketplace(sourceUrl, body.marketplace);
    if (!marketplace) {
      return NextResponse.json(
        { error: "URL invalida. Use link do Mercado Livre ou Amazon." },
        { status: 400 },
      );
    }

    let zenscrapeError = "";
    let officialError = "";
    let fallbackError = "";
    let partialFallback: SuccessResponse | null = null;

    try {
      if (marketplace === "mercadolivre") {
        let zensPayload: SuccessResponse | null = null;
        let officialPayload: SuccessResponse | null = null;

        try {
          const startedAt = Date.now();
          const ml = await extractMercadoLivreWithZenscrape({
            url: sourceUrl,
            affiliateUrl,
          });
          zensPayload = buildFromMercadoLivreZenscrape({
            elapsedMs: Date.now() - startedAt,
            title: ml.title,
            price: ml.price,
            oldPrice: ml.oldPrice,
            imageUrl: ml.imageUrl,
            productUrl: ml.productUrl,
            affiliateUrl: ml.affiliateUrl,
            rawData: ml.rawData,
          });
        } catch (error) {
          zenscrapeError = extractErrorMessage(error);
        }

        try {
          const startedAt = Date.now();
          let accessToken: string | null = null;
          try {
            accessToken = await getValidToken();
          } catch {
            accessToken = null;
          }
          const mlOfficial = await extractMercadoLivreOfficial({
            url: sourceUrl,
            affiliateUrl,
            accessToken: accessToken ?? undefined,
          });
          officialPayload = buildFromMercadoLivreOfficial({
            elapsedMs: Date.now() - startedAt,
            title: mlOfficial.title,
            price: mlOfficial.price,
            oldPrice: mlOfficial.oldPrice,
            imageUrl: mlOfficial.imageUrl,
            permalink: mlOfficial.permalink,
            productUrl: mlOfficial.productUrl,
            affiliateUrl: mlOfficial.affiliateUrl,
            condition: mlOfficial.condition,
            status: mlOfficial.status,
            rawData: mlOfficial.rawData,
          });
        } catch (error) {
          officialError = extractErrorMessage(error);
        }

        const responsePayload = mergeMercadoLivrePayloads(
          zensPayload,
          officialPayload,
        );

        if (responsePayload?.status === "ok") {
          return NextResponse.json({
            ...responsePayload,
            retries: 1,
            debug_info: {
              layer_used:
                responsePayload.engine === "ml-merged-v1"
                  ? "merged"
                  : responsePayload.engine === "ml-official-v2"
                    ? "official"
                    : "zenscrape",
              missing_fields: responsePayload.missing_fields,
              latency_ms: responsePayload.elapsed_ms,
            },
          });
        }
        partialFallback = responsePayload;
      } else {
        const startedAt = Date.now();
        const amazon = await extractAmazonWithRainforest({
          url: sourceUrl,
          affiliateUrl,
        });

        const productData = normalizeAmazonProductData(amazon);
        const responsePayload = buildFromAmazonRainforest({
          elapsedMs: Date.now() - startedAt,
          asin: productData.asin,
          title: productData.title,
          price: productData.price,
          oldPrice: productData.old_price,
          imageUrl: productData.image_url,
          productUrl: productData.product_url,
          affiliateUrl: productData.affiliate_url,
          rawData: productData.raw_data,
        });

        // Garantia explícita para o formulário "Nova Oferta":
        // preview.image_url precisa vir de productData.image_url.
        responsePayload.preview.image_url = productData.image_url;
        responsePayload.image_url = productData.image_url;
        responsePayload.image = productData.image_url;

        if (responsePayload.status === "ok") {
          return NextResponse.json({
            ...responsePayload,
            retries: 1,
            debug_info: {
              layer_used: "rainforest",
              missing_fields: responsePayload.missing_fields,
              latency_ms: responsePayload.elapsed_ms,
            },
          });
        }
        partialFallback = responsePayload;
      }
    } catch (error) {
      officialError = extractErrorMessage(error);
    }

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const extractedEngine = await extractWithContainerEngine({
          url: sourceUrl,
          affiliateUrl,
        });

        const fallbackPayload = buildFromContainerFallback(extractedEngine);
        if (fallbackPayload.status === "ok") {
          return NextResponse.json({
            ...fallbackPayload,
            retries: maxRetries,
            error: officialError || undefined,
            debug_info: {
              layer_used: "container",
              missing_fields: fallbackPayload.missing_fields,
              latency_ms: fallbackPayload.elapsed_ms,
            },
          });
        }

        partialFallback = fallbackPayload;
      } catch (error) {
        fallbackError = extractErrorMessage(error);
      }
    }

    if (partialFallback) {
      const layerUsed: DebugLayer =
        partialFallback.engine === "rainforest-v1"
          ? "rainforest"
          : partialFallback.engine === "zenscrape-v1"
            ? "zenscrape"
            : partialFallback.engine === "ml-merged-v1"
              ? "merged"
            : partialFallback.engine === "ml-official-v2"
              ? "official"
              : "container";
      return NextResponse.json({
        ...partialFallback,
        status: "partial_failure",
        retries: maxRetries,
        debug_info: {
          layer_used: layerUsed,
          missing_fields: partialFallback.missing_fields,
          latency_ms: partialFallback.elapsed_ms,
        },
        error:
          zenscrapeError ||
          officialError ||
          fallbackError ||
          "Extração parcial. Complete manualmente e publique.",
      });
    }

    const manual = buildManualFallbackResponse({
      marketplace,
      sourceUrl,
      affiliateUrl,
      errorMessage:
        zenscrapeError ||
        officialError ||
        fallbackError ||
        "Falha na extração automática. Preencha manualmente.",
    });
    return NextResponse.json({
      ...manual,
      debug_info: {
        layer_used: "container",
        missing_fields: manual.missing_fields,
        latency_ms: manual.elapsed_ms,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
