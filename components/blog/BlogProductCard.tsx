import Image from "next/image";
import Link from "next/link";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";
import { supabaseAdmin } from "@/lib/supabase";

type BlogProductCardProps = {
  offerId: string;
};

type OfferRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  status: string | null;
  expires_at?: string | null;
  marketplace?: string | null;
};

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

function resolveOfferPricing(offer: OfferRow) {
  const price = toNumber(offer.price) ?? 0;
  const oldRaw =
    toNumber(offer.old_price) ??
    toNumber(offer.original_price) ??
    toNumber(offer.price_old);
  const oldPrice = oldRaw !== null && oldRaw > price ? oldRaw : null;
  const directDiscount =
    toNumber(offer.discount_pct) ?? toNumber(offer.discount_percent) ?? null;
  const discountPct =
    directDiscount !== null && directDiscount > 0
      ? Math.round(directDiscount)
      : oldPrice && oldPrice > price
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  return { price, oldPrice, discountPct };
}

async function getOffer(offerId: string): Promise<OfferRow | null> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(
      "id,title,image_url,affiliate_url,product_url,price,old_price,original_price,price_old,discount_pct,discount_percent,status,expires_at,marketplace",
    )
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OfferRow;
}

function isOfferVisible(offer: OfferRow | null): boolean {
  if (!offer || offer.status !== "active") return false;
  if (!String(offer.affiliate_url ?? "").trim()) return false;
  const expiresAt = String(offer.expires_at ?? "").trim();
  if (!expiresAt) return true;

  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime())) return true;

  return expiresDate.getTime() > Date.now();
}

export default async function BlogProductCard({ offerId }: BlogProductCardProps) {
  const offer = await getOffer(offerId);
  if (!isOfferVisible(offer)) {
    return (
      <aside className="my-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Produto relacionado indisponível no momento.
      </aside>
    );
  }

  if (!offer) {
    return null;
  }

  const visibleOffer: OfferRow = offer;
  const { price, oldPrice, discountPct } = resolveOfferPricing(visibleOffer);
  const href = visibleOffer.affiliate_url || "#";
  const marketplace = String(visibleOffer.marketplace ?? "").trim() || "Oferta verificada";

  return (
    <aside className="my-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9e6a18]">
        Produto recomendado
      </p>

      <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <Link href={`/ofertas/${offer.id}`} className="block">
          <Image
            src={visibleOffer.image_url || "/logo.png"}
            alt={visibleOffer.title || "Produto recomendado"}
            width={280}
            height={220}
            className="h-28 w-full rounded-xl border border-slate-200 object-cover"
          />
        </Link>

        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#9e6a18]">
            {marketplace}
          </p>
          <h3 className="line-clamp-2 text-sm font-bold text-[#22223B]">
            {visibleOffer.title || "Produto sem título"}
          </h3>
          <div className="mt-2">
            <div className="mb-2 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                Menor preço dos últimos 30 dias
              </span>
            </div>
            {oldPrice ? (
              <p className="text-xs text-slate-400 line-through">
                {formatBRL(oldPrice)}
              </p>
            ) : null}
            <p className="font-mono text-2xl font-extrabold text-[#22223B]">
              {formatBRL(price)}
            </p>
            {discountPct > 0 ? (
              <p className="text-xs font-semibold text-emerald-700">
                {discountPct}% OFF
              </p>
            ) : null}
          </div>

          <BotaoAfiliado
            offerId={visibleOffer.id}
            href={href}
            source="blog_product_card"
            label="Ver Oferta Agora"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#9e6a18] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 sm:w-auto"
          />
        </div>
      </div>
    </aside>
  );
}

