import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { extractProduct } from "@/lib/scraper/waterfall-extractor";
import { extractWithZyteProduct, type ZyteProductExtraction } from "@/lib/scraping/zyte-product";
import { POST as scraperPOST } from "../scraper/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePreviewTitle(
  product: NonNullable<Awaited<ReturnType<typeof extractProduct>>["product"]>,
): string {
  return toText(product.title) || "Produto sem titulo";
}

function buildZyteResponse(input: {
  zyte: ZyteProductExtraction;
  sourceUrl: string;
  affiliateUrl: string;
  elapsedMs: number;
  fallbackError?: string;
}) {
  const missingFields = [
    !toText(input.zyte.title) ? "title" : "",
    !input.zyte.price ? "price" : "",
    !toText(input.zyte.imageUrl) ? "image_url" : "",
  ].filter(Boolean);

  const title = toText(input.zyte.title) || "Produto sem titulo";
  const productUrl = toText(input.zyte.productUrl) || input.sourceUrl;
  const affiliateUrl = input.affiliateUrl || productUrl;

  return {
    success: true as const,
    status: missingFields.length > 0 ? "partial_failure" : "ok",
    engine: "zyte",
    extraction_layer: "zyte_product",
    elapsed_ms: input.elapsedMs,
    missing_fields: missingFields,
    preview: {
      title,
      price: input.zyte.price ?? 0,
      old_price: input.zyte.oldPrice ?? 0,
      original_price: input.zyte.oldPrice ?? 0,
      image_url: input.zyte.imageUrl,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
    },
    extracted: {
      title,
      price: input.zyte.price,
      old_price: input.zyte.oldPrice,
      original_price: input.zyte.oldPrice,
      image_url: input.zyte.imageUrl,
      url: productUrl,
      affiliate_url: affiliateUrl,
      currency: input.zyte.currency,
      raw: input.zyte.raw,
      fallback_error: input.fallbackError,
    },
    title,
    price: toNumber(input.zyte.price),
    old_price: toNumber(input.zyte.oldPrice),
    image_url: input.zyte.imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    debug_info: {
      layer_used: "zyte_product",
      missing_fields: missingFields,
      latency_ms: input.elapsedMs,
    },
    attempts: [
      {
        method: "zyte_product",
        success: true,
        duration_ms: input.elapsedMs,
      },
    ],
  };
}

async function tryZyteProduct(input: {
  sourceUrl: string;
  affiliateUrl: string;
  fallbackError?: string;
}) {
  if (toText(process.env.ENABLE_ZYTE_FALLBACK).toLowerCase() !== "true") {
    return {
      success: false as const,
      error: "Zyte fallback desativado.",
      elapsed_ms: 0,
    };
  }

  const startedAt = Date.now();
  try {
    const zyte = await extractWithZyteProduct({
      url: input.sourceUrl,
      timeoutMs: 13000,
    });
    return buildZyteResponse({
      zyte,
      sourceUrl: input.sourceUrl,
      affiliateUrl: input.affiliateUrl,
      elapsedMs: Date.now() - startedAt,
      fallbackError: input.fallbackError,
    });
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - startedAt,
    };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    url?: unknown;
    affiliate_url?: unknown;
    persist?: unknown;
  };

  const persist = Boolean(body.persist);
  if (persist) {
    return scraperPOST(req);
  }

  const sourceUrl = toText(body.url);
  const affiliateUrl = toText(body.affiliate_url);
  if (!sourceUrl) {
    return NextResponse.json(
      { success: false, error: "Campo url obrigatorio." },
      { status: 400 },
    );
  }

  const result = await extractProduct(sourceUrl, {
    requestId: crypto.randomUUID(),
    sourceContext: "admin_extract",
  });
  if (!result.success || !result.product) {
    const zyteFallback = await tryZyteProduct({
      sourceUrl,
      affiliateUrl,
      fallbackError: "waterfall_failed",
    });
    if (zyteFallback.success) {
      return NextResponse.json({
        ...zyteFallback,
        request_id: result.request_id,
        attempts: [
          ...result.attempts,
          ...(zyteFallback.attempts ?? []),
        ],
      });
    }

    const scraperFallback = await fetch(new URL("/api/admin/scraper", req.nextUrl.origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") ?? "",
        Authorization: req.headers.get("authorization") ?? "",
      },
      body: JSON.stringify({
        url: sourceUrl,
        affiliate_url: affiliateUrl,
        persist: false,
      }),
      cache: "no-store",
    });
    if (scraperFallback.ok) {
      const payload = await scraperFallback.json().catch(() => null);
      return NextResponse.json(payload ?? { success: true });
    }

    return NextResponse.json(
      {
        success: false,
        request_id: result.request_id,
        status: "error",
        error: "Todas as camadas de extracao falharam.",
        extraction_layer: "none",
        engine: "waterfall",
        attempts: [
          ...result.attempts,
          {
            method: "zyte_product",
            success: false,
            duration_ms: zyteFallback.elapsed_ms,
            error: zyteFallback.error,
          },
        ],
        elapsed_ms: result.total_duration_ms,
      },
      { status: 422 },
    );
  }

  const product = result.product;
  const missingFields = [
    !toText(product.title) ? "title" : "",
    product.price === null ? "price" : "",
    !toText(product.image_url) ? "image_url" : "",
  ].filter(Boolean);

  const isPartial = missingFields.length > 0;

  if (isPartial) {
    const zyteFallback = await tryZyteProduct({
      sourceUrl,
      affiliateUrl,
      fallbackError: `waterfall_partial:${missingFields.join(",")}`,
    });

    if (zyteFallback.success && (zyteFallback.missing_fields?.length ?? 0) < missingFields.length) {
      return NextResponse.json({
        ...zyteFallback,
        request_id: result.request_id,
        attempts: [
          ...result.attempts,
          ...(zyteFallback.attempts ?? []),
        ],
      });
    }
  }

  return NextResponse.json({
    success: true,
    request_id: result.request_id,
    status: isPartial ? "partial_failure" : "ok",
    engine: "waterfall",
    extraction_layer: product.extraction_method,
    elapsed_ms: result.total_duration_ms,
    missing_fields: missingFields,
    preview: {
      title: resolvePreviewTitle(product),
      price: product.price,
      old_price: product.original_price,
      original_price: product.original_price,
      image_url: product.image_url,
      product_url: product.url,
      affiliate_url: affiliateUrl || product.url,
      rating: product.rating,
      reviews: product.rating_count,
    },
    extracted: {
      ...product,
      old_price: product.original_price,
      affiliate_url: affiliateUrl || product.url,
      attempts: result.attempts,
    },
    title: resolvePreviewTitle(product),
    price: toNumber(product.price),
    old_price: toNumber(product.original_price),
    image_url: product.image_url,
    product_url: product.url,
    affiliate_url: affiliateUrl || product.url,
    debug_info: {
      layer_used: product.extraction_method,
      missing_fields: missingFields,
      latency_ms: result.total_duration_ms,
    },
    attempts: result.attempts,
  });
}
