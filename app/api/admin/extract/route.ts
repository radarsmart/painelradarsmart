import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { extractProduct } from "@/lib/scraper/waterfall-extractor";
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
    return NextResponse.json(
      {
        success: false,
        request_id: result.request_id,
        status: "error",
        error: "Todas as camadas de extracao falharam.",
        extraction_layer: "none",
        engine: "waterfall",
        attempts: result.attempts,
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
