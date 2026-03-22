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
      "id,title,image_url,affiliate_url,product_url,price,old_price,original_price,price_old,discount_pct,discount_percent,status",
    )
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OfferRow;
}

export default async function BlogProductCard({ offerId }: BlogProductCardProps) {
  const offer = await getOffer(offerId);
  if (!offer || offer.status !== "active") {
    return (
      <aside className="my-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Produto relacionado indisponivel no momento.
      </aside>
    );
  }

  const { price, oldPrice, discountPct } = resolveOfferPricing(offer);
  const href = offer.affiliate_url || offer.product_url || "#";

  return (
    <aside className="my-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9e6a18]">
        Produto recomendado
      </p>

      <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <Link href={`/ofertas/${offer.id}`} className="block">
          <Image
            src={offer.image_url || "/next.svg"}
            alt={offer.title || "Produto recomendado"}
            width={280}
            height={220}
            className="h-28 w-full rounded-xl border border-slate-200 object-cover"
          />
        </Link>

        <div>
          <h3 className="line-clamp-2 text-sm font-bold text-[#22223B]">
            {offer.title || "Produto sem titulo"}
          </h3>
          <div className="mt-2">
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
            offerId={offer.id}
            href={href}
            source="blog_product_card"
            label="Ver Oferta Agora"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-[#9e6a18] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
          />
        </div>
      </div>
    </aside>
  );
}

