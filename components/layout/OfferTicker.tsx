"use client";

import { motion } from "framer-motion";
import { formatBRL } from "@/lib/formatters";

export type TickerOffer = {
  id: string;
  title: string;
  price: number;
  discount_pct?: number | null;
  image_url?: string | null;
  affiliate_url?: string | null;
  product_url?: string | null;
};

type OfferTickerProps = {
  offers: TickerOffer[];
};

function toValidNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function OfferTicker({ offers }: OfferTickerProps) {
  if (!offers.length) {
    return (
      <div className="fixed inset-x-0 top-0 z-[60] border-b border-white/10 bg-gradient-to-r from-navy-3 via-navy to-navy-2">
        <div className="mx-auto max-w-7xl px-4 py-2 text-center text-xs text-slate-200">
          Radar Smart ao vivo: buscando ofertas ativas...
        </div>
      </div>
    );
  }

  const tickerItems = [...offers, ...offers];
  const baseDuration = Math.max(28, offers.length * 7.5);

  return (
    <div className="fixed inset-x-0 top-0 z-[60] border-b border-white/10 bg-gradient-to-r from-navy-3 via-navy to-navy-2">
      <div className="overflow-hidden">
        <motion.div
          className="flex w-max items-center gap-3 py-1.5 pr-3"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: baseDuration,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        >
          {tickerItems.map((offer, index) => {
            const href = offer.id
              ? `/go/${offer.id}?source=ticker`
              : offer.affiliate_url || "#";
            const discount = Math.max(0, Math.round(toValidNumber(offer.discount_pct)));

            return (
              <a
                key={`${offer.id}-${index}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="group flex min-w-[260px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10 sm:min-w-[330px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={offer.image_url || "/next.svg"}
                  alt={offer.title}
                  className="h-7 w-7 rounded-full border border-white/10 object-cover sm:h-8 sm:w-8"
                  loading="lazy"
                />
                <span className="line-clamp-1 flex-1 text-xs font-medium text-slate-100">
                  {offer.title}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[#9e6a18]">
                  {formatBRL(offer.price)}
                  {discount > 0 ? ` (${discount}% OFF)` : ""}
                </span>
                <span className="shrink-0 rounded-full bg-[#9e6a18] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white transition group-hover:brightness-110">
                  Comprar
                </span>
              </a>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
