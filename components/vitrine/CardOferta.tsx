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
  slot_type?: string;
};

function getMarketplaceBadgeLabel(marketplace?: string): string {
  const normalized = String(marketplace ?? "").toLowerCase();
  if (normalized.includes("amazon")) return "Amazon Brasil";
  if (normalized.includes("mercado")) return "Mercado Livre";
  if (normalized.includes("shopee")) return "Shopee";
  return "Marketplace";
}

function getMarketplaceBadgeTone(marketplace?: string): string {
  const normalized = String(marketplace ?? "").toLowerCase();
  if (normalized.includes("amazon")) return "bg-orange-50 text-orange-700";
  if (normalized.includes("mercado")) return "bg-yellow-50 text-yellow-700";
  if (normalized.includes("shopee")) return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function getSlotBadge(slotType?: string): string | null {
  switch (String(slotType ?? "").trim()) {
    case "flash":
      return "Oferta Relâmpago";
    case "best":
      return "Melhores Ofertas";
    case "hero":
      return "Banner Hero";
    case "comparator":
      return "Comparador";
    default:
      return null;
  }
}

export default function CardOferta({ offer }: { offer: OfertaCard }) {
  const desconto = Math.max(0, Math.round(Number(offer.discount_pct ?? 0)));
  const oldPrice = Number(offer.old_price ?? offer.original_price ?? offer.price);
  const href = offer.affiliate_url || "#";
  const slotBadge = getSlotBadge(offer.slot_type);
  const hasImage = Boolean(String(offer.image_url ?? "").trim());

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
        {desconto > 0 ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow-sm">
            -{desconto}%
          </span>
        ) : null}

        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.image_url}
            alt={offer.title}
            className="h-44 w-full object-contain p-4 sm:h-56"
            loading="lazy"
          />
        ) : (
          <div className="flex h-44 items-center justify-center p-6 text-center text-sm font-medium text-slate-400 sm:h-56">
            Imagem indisponivel
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getMarketplaceBadgeTone(
              offer.marketplace,
            )}`}
          >
            {getMarketplaceBadgeLabel(offer.marketplace)}
          </span>
          {slotBadge ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
              {slotBadge}
            </span>
          ) : null}
          {desconto >= 20 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
              Desconto real
            </span>
          ) : null}
        </div>

        <h3 className="min-h-[3.75rem] text-[15px] font-bold leading-6 text-slate-900 sm:min-h-[4.5rem] sm:text-base">
          {offer.title}
        </h3>

        <div className="mt-auto pt-4">
          <div className="mb-4 flex flex-col">
            {oldPrice > offer.price ? (
              <span className="text-sm text-slate-400 line-through">{formatBRL(oldPrice)}</span>
            ) : null}
            <span className="text-2xl font-black tracking-tight text-emerald-600 sm:text-3xl">
              {formatBRL(offer.price)}
            </span>
          </div>

          <BotaoAfiliado
            offerId={offer.id}
            href={href}
            source="vitrine_card"
            label="Ver oferta"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#ea5f00]"
          />
        </div>
      </div>
    </article>
  );
}
