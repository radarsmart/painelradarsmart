import { NextResponse } from "next/server";

import { isOfferVisibleOnSite } from "@/lib/offers/site-visibility";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  marketplace: string | null;
  rating: number | string | null;
  review_count: number | string | null;
  reviews_count: number | string | null;
  slot_type?: string | null;
  curations_status?: string | null;
  created_at: string;
  updated_at?: string | null;
  published_at?: string | null;
  price_updated_at?: string | null;
  price_trend?: string | null;
  price_previous?: number | string | null;
  expires_at?: string | null;
  manual_copy?: unknown;
  status: string | null;
  pix_price?: number | string | null;
  cash_price?: number | string | null;
  card_price?: number | string | null;
  shipping_cost?: number | string | null;
  installment_count?: number | string | null;
  installment_amount?: number | string | null;
  installment_interest_free?: boolean | null;
  coupon_code?: string | null;
  coupon_description?: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOffer(row: OfferRow) {
  const affiliateUrl = String(row.affiliate_url ?? "").trim();
  if (!affiliateUrl) return null;

  const parsedPrice = toNumber(row.price);
  const price = parsedPrice !== null && parsedPrice > 0 ? parsedPrice : 0;

  const oldPriceRaw =
    toNumber(row.old_price) ?? toNumber(row.original_price) ?? toNumber(row.price_old);
  const oldPrice =
    oldPriceRaw !== null && oldPriceRaw > price && price > 0 ? oldPriceRaw : null;

  const directDiscount =
    toNumber(row.discount_percent) ?? toNumber(row.discount_pct) ?? null;
  const discount =
    directDiscount !== null && directDiscount > 0
      ? Math.round(directDiscount)
      : oldPrice
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  const slotType = String(row.slot_type ?? "").trim();

  return {
    id: row.id,
    title: row.title?.trim() || "Oferta sem titulo",
    marketplace: row.marketplace?.trim() || "Marketplace",
    price,
    pix_price: toNumber(row.pix_price),
    cash_price: toNumber(row.cash_price),
    card_price: toNumber(row.card_price),
    shipping_cost: toNumber(row.shipping_cost),
    pixPrice: toNumber(row.pix_price),
    cashPrice: toNumber(row.cash_price),
    cardPrice: toNumber(row.card_price),
    shippingCost: toNumber(row.shipping_cost),
    installment_count: toNumber(row.installment_count),
    installment_amount: toNumber(row.installment_amount),
    installment_interest_free: row.installment_interest_free ?? null,
    installmentCount: toNumber(row.installment_count),
    installmentAmount: toNumber(row.installment_amount),
    installmentInterestFree: row.installment_interest_free ?? null,
    coupon_code: row.coupon_code?.trim() || null,
    coupon_description: row.coupon_description?.trim() || null,
    couponCode: row.coupon_code?.trim() || null,
    couponDescription: row.coupon_description?.trim() || null,
    oldPrice,
    discount,
    imageUrl: row.image_url,
    affiliateUrl,
    rating: toNumber(row.rating),
    reviews: toNumber(row.review_count) ?? toNumber(row.reviews_count),
    slotType,
    priceUpdatedAt: row.price_updated_at ?? null,
    priceTrend: String(row.price_trend ?? "stable"),
    pricePrevious: toNumber(row.price_previous) || null,
  };
}

export async function GET() {
  const offerSelect =
    "id,title,price,old_price,original_price,price_old,discount_pct,discount_percent,image_url,affiliate_url,product_url,marketplace,rating,review_count,reviews_count,slot_type,curations_status,created_at,updated_at,published_at,price_updated_at,price_trend,price_previous,expires_at,manual_copy,status,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free,coupon_code,coupon_description";

  const [flashResult, bestResult, comparatorResult] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select(offerSelect)
      .eq("status", "active")
      .eq("slot_type", "flash")
      .order("updated_at", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("offers")
      .select(offerSelect)
      .eq("status", "active")
      .eq("slot_type", "best")
      .order("updated_at", { ascending: false })
      .limit(120),
    supabaseAdmin
      .from("offers")
      .select(offerSelect)
      .eq("status", "active")
      .eq("slot_type", "comparator")
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const err =
    flashResult.error ??
    bestResult.error ??
    comparatorResult.error;

  if (err) {
    return NextResponse.json(
      { error: err.message, hero: [], flash: [], best: [], comparator: [] },
      { status: 500 },
    );
  }

  const flash = ((flashResult.data ?? []) as OfferRow[])
    .filter((row) => isOfferVisibleOnSite(row))
    .map(normalizeOffer)
    .filter(Boolean);
  const best = ((bestResult.data ?? []) as OfferRow[])
    .filter((row) => isOfferVisibleOnSite(row))
    .map(normalizeOffer)
    .filter(Boolean);
  const comparator = ((comparatorResult.data ?? []) as OfferRow[])
    .filter((row) => isOfferVisibleOnSite(row))
    .map(normalizeOffer)
    .filter(Boolean);
  const comparatorFallback = comparator.length ? comparator : [...best, ...flash];

  return NextResponse.json(
    {
      hero: [],
      flash: flash.slice(0, 8),
      best: best.slice(0, 8),
      comparator: comparatorFallback.slice(0, 12),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
