import Image from "next/image";
import Badge from "@/components/ui/Badge";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";

export type OfertaCard = {
  id: string;
  title: string;
  marketplace?: string;
  price: number;
  original_price?: number;
  discount_pct?: number;
  image_url?: string;
  affiliate_url?: string;
  product_url?: string;
};

export default function CardOferta({ offer }: { offer: OfertaCard }) {
  const desconto = Number(offer.discount_pct ?? 0);
  const oldPrice = Number(offer.original_price ?? offer.price);
  const href = offer.affiliate_url || offer.product_url || "#";

  return (
    <article className="rounded-xl border border-rs-border bg-white p-4 shadow-card transition hover:-translate-y-0.5">
      <div className="relative mb-4 flex h-52 items-center justify-center overflow-hidden rounded-t-xl border border-slate-200 bg-white">
        <Image
          src={offer.image_url || "/next.svg"}
          alt={offer.title}
          width={600}
          height={420}
          className="h-full w-full object-contain"
        />
        {desconto > 0 ? (
          <Badge className="absolute left-2 top-2" variant="danger">
            -{desconto}%
          </Badge>
        ) : null}
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-rs-muted">
        {offer.marketplace || "Marketplace"}
      </p>
      <h3 className="mt-1 line-clamp-2 min-h-12 text-sm font-semibold text-navy-3">
        {offer.title}
      </h3>

      <div className="mt-3">
        {oldPrice > offer.price ? (
          <p className="text-xs text-rs-muted line-through">{formatBRL(oldPrice)}</p>
        ) : null}
        <p className="font-mono text-2xl font-bold text-rs-red">
          {formatBRL(offer.price)}
        </p>
      </div>

      <div className="mt-4">
        <BotaoAfiliado
          offerId={offer.id}
          href={href}
          source="vitrine_card"
          label="Ver oferta"
          className="inline-flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-2"
        />
      </div>
    </article>
  );
}
