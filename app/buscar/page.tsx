import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { Search } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GridOfertas from "@/components/vitrine/GridOfertas";
import type { OfertaCard } from "@/components/vitrine/CardOferta";
import { CATEGORY_MENU } from "@/lib/offers/categories";
import { isOfferVisibleOnSite } from "@/lib/offers/site-visibility";
import { toAbsoluteSiteUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

const PAGE_TITLE = "Buscar ofertas";
const PAGE_DESCRIPTION =
  "Busque produtos entre as ofertas ativas e aprovadas do Radar Smart.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: toAbsoluteSiteUrl("/buscar"),
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
  expires_at: string | null;
  installment_count: number | string | null;
  installment_amount: number | string | null;
  installment_interest_free: boolean | null;
  coupon_code: string | null;
  coupon_description: string | null;
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
    title: row.title?.trim() || "Oferta sem título",
    marketplace: row.marketplace?.trim() || "Marketplace",
    price,
    old_price: oldPrice,
    discount_pct: discountPct,
    image_url: row.image_url || undefined,
    affiliate_url: row.affiliate_url || undefined,
    product_url: row.product_url || undefined,
    slot_type: row.slot_type || undefined,
    installment_count: toNumber(row.installment_count) || null,
    installment_amount: toNumber(row.installment_amount) || null,
    installment_interest_free: row.installment_interest_free,
    coupon_code: row.coupon_code,
    coupon_description: row.coupon_description,
  };
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  noStore();

  const query = String(searchParams?.q ?? "").trim();
  let offers: OfertaCard[] = [];

  if (query.length >= 2) {
    try {
      const { data } = await supabaseAdmin
        .from("offers")
        .select(
          "id,title,marketplace,price,old_price,original_price,discount_pct,discount_percent,image_url,affiliate_url,product_url,slot_type,expires_at,status,curations_status,updated_at,created_at,published_at,manual_copy,installment_count,installment_amount,installment_interest_free,coupon_code,coupon_description",
        )
        .eq("status", "active")
        .in("slot_type", ["flash", "best", "comparator"])
        .ilike("title", `%${query}%`)
        .order("updated_at", { ascending: false })
        .limit(60);

      offers = ((data ?? []) as OfferRow[])
        .filter((row) => isOfferVisibleOnSite(row))
        .map(normalizeOffer);
    } catch {
      offers = [];
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-10 md:py-12">
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
          <h1 className="font-display text-4xl font-black text-navy">Buscar</h1>
          <p className="mt-3 text-sm text-rs-muted md:text-base">
            Digite o nome do produto, marca ou o que você está procurando.
          </p>

          <form action="/buscar" method="GET" className="mt-6">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-[#9e6a18]">
              <Search className="h-5 w-5 flex-none text-slate-400" />
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Ex: tênis, fone bluetooth, whey protein..."
                autoFocus
                className="w-full bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 md:text-base"
              />
              <button
                type="submit"
                className="flex-none rounded-xl bg-[#22223B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f2f4d]"
              >
                Buscar
              </button>
            </div>
          </form>

          {query.length >= 2 ? (
            <div className="mt-8">
              <p className="mb-4 text-sm font-semibold text-slate-500">
                {offers.length
                  ? `${offers.length} resultado${offers.length === 1 ? "" : "s"} para "${query}"`
                  : `Nenhum resultado para "${query}"`}
              </p>
              <GridOfertas offers={offers} />
            </div>
          ) : (
            <div className="mt-10">
              {query.length === 1 ? (
                <p className="mb-6 text-sm text-slate-500">Digite pelo menos 2 letras pra buscar.</p>
              ) : null}
              <p className="mb-4 text-sm font-semibold text-slate-500">Ou navegue por categoria</p>
              <div className="flex flex-wrap gap-3">
                {CATEGORY_MENU.filter((cat) => cat.slug !== "outros").map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/ofertas?categoria=${cat.slug}`}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-[#9e6a18] hover:text-[#9e6a18]"
                  >
                    <span>{cat.icon}</span> {cat.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
