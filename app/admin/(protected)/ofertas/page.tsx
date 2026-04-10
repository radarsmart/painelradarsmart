import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import TabelaOfertas from "@/components/admin/TabelaOfertas";
import RefreshSiteOffersButton from "@/components/admin/RefreshSiteOffersButton";
import { isOfferVisibleOnSite } from "@/lib/offers/site-visibility";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminOfferRow = {
  id: string;
  title: string;
  marketplace?: string | null;
  image_url?: string | null;
  price?: number | null;
  old_price?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  price_updated_at?: string | null;
  price_previous?: number | null;
  price_trend?: string | null;
  curations_status?: string | null;
  affiliate_url?: string | null;
  slot_type?: string | null;
  manual_copy?: unknown;
  quality_score?: number | null;
  is_priority?: boolean | null;
};

export default async function AdminOfertasPage() {
  noStore();

  const { data } = await supabaseAdmin
    .from("offers")
    .select("id,title,marketplace,image_url,price,old_price,status,created_at,updated_at,published_at,expires_at,price_updated_at,price_previous,price_trend,curations_status,affiliate_url,slot_type,manual_copy,quality_score,is_priority")
    .eq("status", "active")
    .not("affiliate_url", "is", null)
    .in("slot_type", ["flash", "best", "comparator"])
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(300);

  const publishedOffers = ((data ?? []) as AdminOfferRow[]).filter(
    (offer) => isOfferVisibleOnSite(offer),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">
            Ofertas publicadas no site
          </h1>
          <p className="mt-1 text-sm text-rs-muted">
            Gerencie somente as ofertas aprovadas que aparecem na vitrine publica.
            Use Editar para trocar o link de afiliado ou Excluir para remover do site.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <RefreshSiteOffersButton />
          <Link
            href="/admin/ofertas/nova"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-navy px-4 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Nova oferta
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Regra operacional</p>
        <p className="mt-1">
          Uma oferta so aparece no site quando estiver com status ativo,
          link de afiliado preenchido e liberacao editorial valida.
        </p>
      </div>

      <TabelaOfertas initialOffers={publishedOffers} />
    </div>
  );
}
