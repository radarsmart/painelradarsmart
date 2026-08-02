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
  installment_count?: number | null;
  installment_amount?: number | null;
  installment_interest_free?: boolean | null;
  coupon_code?: string | null;
  coupon_description?: string | null;
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
  const installmentText =
    offer.installment_count && offer.installment_amount
      ? `ou ${offer.installment_count}x de ${formatBRL(offer.installment_amount)}${offer.installment_interest_free ? " sem juros" : ""}`
      : null;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-4">
      <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:rounded-2xl">
        {desconto > 0 ? (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm sm:left-3 sm:top-3 sm:px-2 sm:py-1 sm:text-[10px]">
            -{desconto}%
          </span>
        ) : null}

        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.image_url}
            alt={offer.title}
            className="h-28 w-full object-contain p-2 sm:h-44 sm:p-4 md:h-56"
            loading="lazy"
          />
        ) : (
          <div className="flex h-28 items-center justify-center p-3 text-center text-xs font-medium text-slate-400 sm:h-44 sm:p-6 sm:text-sm md:h-56">
            Imagem indisponivel
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-2.5 sm:pt-4">
        <div className="mb-2 flex flex-wrap gap-1 sm:mb-3 sm:gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wide sm:px-2.5 sm:py-1 sm:text-[10px] ${getMarketplaceBadgeTone(
              offer.marketplace,
            )}`}
          >
            {getMarketplaceBadgeLabel(offer.marketplace)}
          </span>
          {slotBadge ? (
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 sm:inline-block">
              {slotBadge}
            </span>
          ) : null}
          {desconto >= 20 ? (
            <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 sm:inline-block">
              Desconto real
            </span>
          ) : null}
        </div>

        <h3 className="min-h-[2.5rem] text-xs font-bold leading-5 text-slate-900 sm:min-h-[4.5rem] sm:text-base sm:leading-6">
          {offer.title}
        </h3>

        <div className="mt-auto pt-2.5 sm:pt-4">
          <div className="mb-2.5 flex flex-col sm:mb-4">
            {oldPrice > offer.price ? (
              <span className="text-xs text-slate-400 line-through sm:text-sm">{formatBRL(oldPrice)}</span>
            ) : null}
            <span className="text-lg font-black tracking-tight text-emerald-600 sm:text-2xl md:text-3xl">
              {formatBRL(offer.price)}
            </span>
          </div>

          {installmentText ? (
            <p className="mb-1.5 text-[11px] text-slate-500 sm:text-xs">{installmentText}</p>
          ) : null}
          {offer.coupon_code ? (
            <p
              className="mb-2 truncate text-[11px] font-semibold text-emerald-600 sm:text-xs"
              title={offer.coupon_description ?? undefined}
            >
              🏷️ Cupom {offer.coupon_code}
            </p>
          ) : null}

          <BotaoAfiliado
            offerId={offer.id}
            href={href}
            source="vitrine_card"
            label="Ver oferta"
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#FF6A00] px-2 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#ea5f00] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
          />
        </div>
      </div>
    </article>
  );
}
