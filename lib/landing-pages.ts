import { supabaseAdmin } from "@/lib/supabase";

export type LandingPageRow = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  offer_id: string | null;
  marketplace: string | null;
  headline: string;
  subheadline: string | null;
  badge_text: string | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  product_title: string | null;
  product_price: number | string | null;
  product_old_price: number | string | null;
  affiliate_url: string;
  site_url: string | null;
  group_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  instagram_url: string | null;
  telegram_url: string | null;
  whatsapp_url: string | null;
  primary_cta_label: string;
  group_cta_label: string;
  site_cta_label: string;
  price_note: string | null;
  benefits: unknown;
  technical_details: unknown;
  social_proof: unknown;
  disclaimer: string | null;
  published_at: string | null;
};

export type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  old_price: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  marketplace: string | null;
};

export type LandingPageBundle = {
  landingPage: LandingPageRow;
  linkedOffer: OfferRow | null;
  headline: string;
  subheadline: string | null;
  badgeText: string;
  productTitle: string;
  heroImageUrl: string | null;
  heroVideoUrl: string | null;
  affiliateUrl: string;
  currentPrice: number | null;
  oldPrice: number | null;
  discount: number | null;
  marketplace: string;
  benefits: string[];
  technicalDetails: string[];
  socialProof: string[];
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = toText(value).replace(/\./g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item)).filter(Boolean);
}

async function getLinkedOffer(offerId: string | null): Promise<OfferRow | null> {
  if (!offerId) return null;

  const { data } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,old_price,image_url,affiliate_url,marketplace")
    .eq("id", offerId)
    .maybeSingle();

  return (data as OfferRow | null) ?? null;
}

function buildLandingBundle(
  landingPage: LandingPageRow,
  linkedOffer: OfferRow | null,
): LandingPageBundle {
  const currentPrice =
    toNumber(landingPage.product_price) ?? toNumber(linkedOffer?.price);
  const oldPrice =
    toNumber(landingPage.product_old_price) ?? toNumber(linkedOffer?.old_price);
  const discount =
    currentPrice && oldPrice && oldPrice > currentPrice
      ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100)
      : null;

  return {
    landingPage,
    linkedOffer,
    headline: landingPage.headline,
    subheadline: landingPage.subheadline || null,
    badgeText: landingPage.badge_text || "Oferta selecionada pelo Radar Smart",
    productTitle:
      landingPage.product_title || toText(linkedOffer?.title) || landingPage.title,
    heroImageUrl: landingPage.hero_image_url || linkedOffer?.image_url || null,
    heroVideoUrl: landingPage.hero_video_url || null,
    affiliateUrl: landingPage.affiliate_url || toText(linkedOffer?.affiliate_url),
    currentPrice,
    oldPrice,
    discount,
    marketplace:
      landingPage.marketplace ||
      toText(linkedOffer?.marketplace) ||
      "Marketplace",
    benefits: toStringArray(landingPage.benefits),
    technicalDetails: toStringArray(landingPage.technical_details),
    socialProof: toStringArray(landingPage.social_proof),
  };
}

export async function getPublishedLandingBundleBySlug(
  slug: string,
): Promise<LandingPageBundle | null> {
  const { data } = await supabaseAdmin
    .from("landing_pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  const landingPage = (data as LandingPageRow | null) ?? null;
  if (!landingPage) return null;

  const linkedOffer = await getLinkedOffer(landingPage.offer_id);
  return buildLandingBundle(landingPage, linkedOffer);
}

export async function getLandingBundleById(
  id: string,
): Promise<LandingPageBundle | null> {
  const { data } = await supabaseAdmin
    .from("landing_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const landingPage = (data as LandingPageRow | null) ?? null;
  if (!landingPage) return null;

  const linkedOffer = await getLinkedOffer(landingPage.offer_id);
  return buildLandingBundle(landingPage, linkedOffer);
}
