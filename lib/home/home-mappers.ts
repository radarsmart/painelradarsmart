import type { OfertaCard } from "@/components/vitrine/CardOferta";

import type {
  HomeBlogPost,
  HomeCategory,
  HomeHighlight,
} from "@/lib/home/home-types";

type GenericRow = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(normalized) ? normalized : fallback;
  }
  return fallback;
}

export function mapCategory(row: GenericRow): HomeCategory {
  return {
    id: asString(row.id, asString(row.slug, "categoria")),
    name: asString(row.name, "Categoria"),
    slug: asString(row.slug, ""),
    icon: asString(row.icon, "") || null,
  };
}

export function mapOffer(row: GenericRow): OfertaCard {
  return {
    id: asString(row.id, "offer"),
    title: asString(row.title, "Oferta sem titulo"),
    marketplace: asString(row.marketplace, "Marketplace"),
    price: asNumber(row.price, 0),
    old_price: asNumber(row.old_price, 0) || undefined,
    original_price: asNumber(row.original_price, 0) || undefined,
    discount_pct: asNumber(row.discount_pct, 0) || undefined,
    image_url: asString(row.image_url, "") || undefined,
    affiliate_url: asString(row.affiliate_url, "") || undefined,
    product_url: asString(row.product_url, "") || undefined,
    slot_type: asString(row.slot_type, "") || undefined,
  };
}

export function mapBlogPost(row: GenericRow): HomeBlogPost {
  return {
    id: asString(row.id, "post"),
    title: asString(row.title, "Guia Radar Smart"),
    slug: asString(row.slug, ""),
    excerpt: asString(row.excerpt, "") || null,
    imageUrl: asString(row.cover_image, "") || asString(row.featured_image, "") || null,
    publishedAt: asString(row.published_at, "") || asString(row.created_at, "") || null,
  };
}

export function mapHighlight(row: GenericRow): HomeHighlight {
  return {
    id: asString(row.id, "highlight"),
    title:
      asString(row.title, "") ||
      asString(row.headline, "") ||
      asString(row.name, "Destaque Radar Smart"),
    subtitle:
      asString(row.subtitle, "") ||
      asString(row.description, "") ||
      null,
    href: asString(row.href, "") || asString(row.link_url, "") || null,
  };
}
