import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ComparativoClient, {
  type CompareOffer,
} from "@/components/comparativo/ComparativoClient";
import { supabaseAdmin } from "@/lib/supabase";

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  rating: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  status: string | null;
  created_at: string | null;
};

export const metadata: Metadata = {
  title: "Comparador Inteligente de Preços - Radar Smart",
  description:
    "Compare dois produtos lado a lado e descubra qual oferta tem melhor custo-benefício no Radar Smart.",
};

export const revalidate = 120;

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOffer(row: OfferRow): CompareOffer | null {
  const price = toNumber(row.price);
  if (price === null || price <= 0) return null;

  const oldRaw =
    toNumber(row.old_price) ??
    toNumber(row.original_price) ??
    toNumber(row.price_old);
  const oldPrice = oldRaw !== null && oldRaw > price ? oldRaw : null;

  const directDiscount =
    toNumber(row.discount_pct) ?? toNumber(row.discount_percent) ?? null;
  const discountPct =
    directDiscount !== null && directDiscount > 0
      ? Math.round(directDiscount)
      : oldPrice
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  return {
    id: row.id,
    title: row.title?.trim() || "Produto sem título",
    marketplace: row.marketplace?.trim() || "Marketplace",
    price,
    oldPrice,
    discountPct,
    rating: toNumber(row.rating),
    imageUrl: row.image_url,
    affiliateUrl: row.affiliate_url || row.product_url || "#",
    category: row.category,
  };
}

async function getActiveOffers(): Promise<CompareOffer[]> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(
      "id,title,marketplace,category,price,old_price,original_price,price_old,discount_pct,discount_percent,rating,image_url,affiliate_url,product_url,status,created_at",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error || !data) return [];

  return (data as OfferRow[])
    .map(normalizeOffer)
    .filter((offer): offer is CompareOffer => Boolean(offer));
}

export default async function ComparativoPage() {
  const offers = await getActiveOffers();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-navy">
            Comparador Inteligente
          </h1>
          <p className="mt-2 text-sm text-rs-muted">
            Compare duas ofertas ativas em tempo real e veja o veredito do Radar
            Smart com foco em preço e desconto.
          </p>
        </div>

        <ComparativoClient offers={offers} />
      </main>
      <Footer />
    </>
  );
}

