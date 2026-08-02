import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Link from "next/link";
import GridOfertas from "@/components/vitrine/GridOfertas";
import type { OfertaCard } from "@/components/vitrine/CardOferta";
import { isOfferVisibleOnSite } from "@/lib/offers/site-visibility";
import { CATEGORY_MENU, resolveCategory } from "@/lib/offers/categories";
import { toAbsoluteSiteUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_TITLE = "Ofertas aprovadas e ativas";
const PAGE_DESCRIPTION =
  "Veja as ofertas aprovadas e ativas do Radar Smart, com curadoria e links para comprar melhor nos principais marketplaces.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: toAbsoluteSiteUrl("/ofertas"),
  },
  openGraph: {
    title: `${PAGE_TITLE} | Radar Smart`,
    description: PAGE_DESCRIPTION,
    url: toAbsoluteSiteUrl("/ofertas"),
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${PAGE_TITLE} | Radar Smart`,
    description: PAGE_DESCRIPTION,
  },
};

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  slot_type: string | null;
  category: string | null;
  expires_at: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  curations_status?: string | null;
  manual_copy?: unknown;
  status?: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (match, code: string) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : match;
    });
}

function normalizeMarketplaceLabel(row: OfferRow): string {
  const rawMarketplace = String(row.marketplace ?? "").trim().toLowerCase();
  const sourceUrl = `${row.affiliate_url ?? ""} ${row.product_url ?? ""}`.toLowerCase();

  if (rawMarketplace.includes("amazon") || sourceUrl.includes("amazon.")) {
    return "Amazon Brasil";
  }
  if (
    rawMarketplace.includes("mercado") ||
    rawMarketplace.includes("mercadolivre") ||
    rawMarketplace.includes("mercado livre") ||
    sourceUrl.includes("mercadolivre.") ||
    sourceUrl.includes("meli.")
  ) {
    return "Mercado Livre";
  }
  if (rawMarketplace.includes("shopee") || sourceUrl.includes("shopee.")) {
    return "Shopee";
  }

  return "Marketplace";
}

function normalizeOffer(row: OfferRow): OfertaCard {
  const price = toNumber(row.price);
  const oldPriceRaw = toNumber(row.old_price) || toNumber(row.original_price);
  const oldPrice = oldPriceRaw > price ? oldPriceRaw : undefined;
  const discountDirect = toNumber(row.discount_percent) || toNumber(row.discount_pct);
  const discountPct =
    discountDirect > 0
      ? Math.round(discountDirect)
      : oldPrice && price > 0
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  return {
    id: row.id,
    title: decodeEntities(row.title?.trim() || "Oferta sem título"),
    marketplace: normalizeMarketplaceLabel(row),
    price,
    old_price: oldPrice,
    discount_pct: discountPct,
    image_url: row.image_url || undefined,
    affiliate_url: row.affiliate_url || undefined,
    product_url: row.product_url || undefined,
    slot_type: row.slot_type || undefined,
  };
}

export default async function OfertasPage({
  searchParams,
}: {
  searchParams: { categoria?: string };
}) {
  noStore();

  const selectedCategory = String(searchParams?.categoria ?? "").trim();

  let rows: OfferRow[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("offers")
      .select(
        "id,title,marketplace,price,old_price,original_price,discount_pct,discount_percent,image_url,affiliate_url,product_url,slot_type,category,expires_at,status,curations_status,updated_at,created_at,published_at,manual_copy",
      )
      .eq("status", "active")
      .in("slot_type", ["flash", "best", "comparator"])
      .order("published_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300);

    rows = ((data ?? []) as OfferRow[]).filter((row) => isOfferVisibleOnSite(row));
  } catch {
    rows = [];
  }

  const categoryCounts = new Map<string, number>();
  for (const row of rows) {
    const slug = resolveCategory(row.category).slug;
    categoryCounts.set(slug, (categoryCounts.get(slug) ?? 0) + 1);
  }

  const visibleCategories = CATEGORY_MENU.filter((cat) => categoryCounts.has(cat.slug));

  const filteredRows = selectedCategory
    ? rows.filter((row) => resolveCategory(row.category).slug === selectedCategory)
    : rows;

  const offers: OfertaCard[] = filteredRows.map(normalizeOffer);
  const activeCategoryLabel = CATEGORY_MENU.find((cat) => cat.slug === selectedCategory)?.label;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-10 md:py-12">
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
          <h1 className="font-display text-4xl font-black text-navy">Ofertas</h1>
          <p className="mt-3 text-sm text-rs-muted md:text-base">
            {activeCategoryLabel
              ? `Ofertas de ${activeCategoryLabel.toLowerCase()} aprovadas e ativas no Radar Smart.`
              : "Lista de ofertas aprovadas e ativas no Radar Smart."}
          </p>

          {visibleCategories.length > 1 ? (
            <div className="mt-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Link
                href="/ofertas"
                className={`flex-none rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  !selectedCategory
                    ? "border-navy bg-navy text-white"
                    : "border-slate-200 text-slate-600 hover:border-navy"
                }`}
              >
                Todas
              </Link>
              {visibleCategories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/ofertas?categoria=${cat.slug}`}
                  className={`flex-none rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selectedCategory === cat.slug
                      ? "border-navy bg-navy text-white"
                      : "border-slate-200 text-slate-600 hover:border-navy"
                  }`}
                >
                  {cat.icon} {cat.label}
                  <span className="ml-1.5 text-xs opacity-70">{categoryCounts.get(cat.slug)}</span>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-8">
            <GridOfertas offers={offers} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
