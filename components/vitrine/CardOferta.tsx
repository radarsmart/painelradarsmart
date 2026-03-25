import Image from "next/image";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";

export type OfertaCard = {
  id: string;
  title: string;
  marketplace?: string;
  price: number;
  old_price?: number;
  original_price?: number;
  discount_pct?: number;
  image_url?: string;
  affiliate_url?: string;
  product_url?: string;
};

function getMarketplaceBadgeLabel(marketplace?: string): string {
  const normalized = String(marketplace ?? "").toLowerCase();
  if (normalized.includes("amazon")) return "Amazon Brasil";
  if (normalized.includes("mercado")) return "Mercado Livre";
  return "Marketplace";
}

export default function CardOferta({ offer }: { offer: OfertaCard }) {
  const desconto = Math.max(0, Math.round(Number(offer.discount_pct ?? 0)));
  const oldPrice = Number(offer.old_price ?? offer.original_price ?? offer.price);
  const href = offer.affiliate_url || offer.product_url || "#";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 md:p-4">
      <div className="relative">
        {desconto > 0 ? (
          <span className="absolute left-1 top-1 z-10 rounded-md bg-red-600 px-1.5 py-0.5 text-[8px] font-black text-white">
            -{desconto}%
          </span>
        ) : null}

        <Image
          src={offer.image_url || "/next.svg"}
          alt={offer.title}
          width={600}
          height={420}
          className="mb-2 h-28 w-full object-contain md:h-40"
        />
      </div>

      <div className="flex flex-1 flex-col">
        <div className="mb-2 flex flex-wrap gap-1">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tight text-slate-600">
            {getMarketplaceBadgeLabel(offer.marketplace)}
          </span>
          {desconto >= 20 ? (
            <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tight text-orange-700">
              Oferta Relampago
            </span>
          ) : null}
        </div>

        <h3 className="mb-2 h-8 line-clamp-2 text-[11px] font-bold leading-tight text-gray-800 md:text-sm">
          {offer.title}
        </h3>

        <div className="mt-auto">
          <div className="mb-2 flex flex-col">
            {oldPrice > offer.price ? (
              <span className="text-[9px] text-gray-400 line-through">{formatBRL(oldPrice)}</span>
            ) : null}
            <span className="text-sm font-black text-green-600 md:text-lg">
              {formatBRL(offer.price)}
            </span>
          </div>

          <BotaoAfiliado
            offerId={offer.id}
            href={href}
            source="vitrine_card"
            label="RESGATAR 🚀"
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-tight text-white shadow-md transition-all active:scale-95 hover:from-orange-600 hover:to-orange-600"
          />
        </div>
      </div>
    </article>
  );
}
