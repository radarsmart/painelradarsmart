import type { NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import { normalizeIdentifier, toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type LearningSegmentInput = {
  normalizedProduct: NormalizedProduct;
  offer: Record<string, unknown>;
  channel?: string | null;
  publishedAt?: string | null;
};

export type LearningSegment = {
  key: string;
  level: "exact" | "category_marketplace_price" | "category_price_channel" | "category";
  category: string;
  marketplace: string | null;
  channel: string | null;
  price_range: string;
  discount_range: string;
  payment_profile: string;
  hour_bucket: string | null;
  day_of_week: number | null;
};

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function slug(value: unknown): string {
  return normalizeIdentifier(value) ?? "unknown";
}

function priceRange(value: unknown): string {
  const price = toNullableNumber(value);
  if (price === null) return "unknown";
  if (price < 70) return "0-70";
  if (price < 150) return "70-150";
  if (price < 300) return "150-300";
  if (price < 450) return "300-450";
  if (price < 700) return "450-700";
  if (price < 1000) return "700-1000";
  if (price < 2000) return "1000-2000";
  return "2000-plus";
}

function discountRange(value: unknown): string {
  const discount = toNullableNumber(value);
  if (discount === null || discount <= 0) return "no-discount";
  if (discount < 10) return "1-10";
  if (discount < 20) return "10-20";
  if (discount < 35) return "20-35";
  if (discount < 50) return "35-50";
  return "50-plus";
}

function paymentProfile(offer: Record<string, unknown>): string {
  const pix = toNullableNumber(offer.pix_price ?? offer.cash_price);
  const installments = toNullableNumber(offer.installment_count);
  const interestFree = offer.installment_interest_free === true;

  if (pix !== null && installments !== null && installments >= 6 && interestFree) return "pix-plus-installments";
  if (installments !== null && installments >= 6 && interestFree) return "installments-interest-free";
  if (installments !== null && installments >= 2) return "installments";
  if (pix !== null) return "pix";
  return "standard";
}

function hourBucket(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return "06-12";
  if (hour >= 12 && hour < 18) return "12-18";
  if (hour >= 18 && hour < 21) return "18-21";
  if (hour >= 21 && hour < 24) return "21-24";
  return "00-06";
}

function dayOfWeek(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getDay();
}

function key(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => slug(part ?? "any")).join("|");
}

export function normalizeLearningChannel(value: unknown): string {
  const source = String(value ?? "").trim().toLowerCase();
  if (/whatsapp|zap/.test(source)) return "whatsapp";
  if (/telegram/.test(source)) return "telegram";
  if (/instagram|reels|stories/.test(source)) return "instagram";
  if (/tiktok/.test(source)) return "tiktok";
  if (/email|newsletter/.test(source)) return "email";
  return "site";
}

export function deriveLearningSegments(input: LearningSegmentInput): LearningSegment[] {
  const category = input.normalizedProduct.category;
  const marketplace = textOrNull(input.offer.marketplace ?? input.offer.platform);
  const channel = input.channel ? normalizeLearningChannel(input.channel) : null;
  const price = priceRange(input.offer.effective_price ?? input.offer.price ?? input.offer.regular_price);
  const discount = discountRange(input.offer.radar_real_discount ?? input.offer.discount_pct ?? input.offer.discount_percent);
  const payment = paymentProfile(input.offer);
  const publishedAt = input.publishedAt ?? textOrNull(input.offer.published_at ?? input.offer.updated_at);
  const hour = hourBucket(publishedAt);
  const dow = dayOfWeek(publishedAt);

  return [
    {
      key: key(["exact", category, marketplace, channel, price, discount, payment, hour, dow]),
      level: "exact",
      category,
      marketplace,
      channel,
      price_range: price,
      discount_range: discount,
      payment_profile: payment,
      hour_bucket: hour,
      day_of_week: dow,
    },
    {
      key: key(["cmp", category, marketplace, price]),
      level: "category_marketplace_price",
      category,
      marketplace,
      channel: null,
      price_range: price,
      discount_range: "any",
      payment_profile: "any",
      hour_bucket: null,
      day_of_week: null,
    },
    {
      key: key(["cpc", category, price, channel]),
      level: "category_price_channel",
      category,
      marketplace: null,
      channel,
      price_range: price,
      discount_range: "any",
      payment_profile: "any",
      hour_bucket: null,
      day_of_week: null,
    },
    {
      key: key(["category", category]),
      level: "category",
      category,
      marketplace: null,
      channel: null,
      price_range: "any",
      discount_range: "any",
      payment_profile: "any",
      hour_bucket: null,
      day_of_week: null,
    },
  ];
}
