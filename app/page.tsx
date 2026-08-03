"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  Flame,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import OfferTicker, { type TickerOffer } from "@/components/layout/OfferTicker";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CountdownTimer from "@/components/vitrine/CountdownTimer";
import { formatBRL } from "@/lib/formatters";
import { CATEGORY_MENU } from "@/lib/offers/categories";
import { isOfferVisibleOnSite } from "@/lib/offers/site-visibility";
import { supabase } from "@/lib/supabase";

type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  marketplace: string | null;
  rating: number | string | null;
  review_count: number | string | null;
  reviews_count: number | string | null;
  slot_type?: string | null;
  curations_status?: string | null;
  created_at: string;
  updated_at?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  manual_copy?: unknown;
  status: string | null;
  installment_count: number | string | null;
  installment_amount: number | string | null;
  installment_interest_free: boolean | null;
  coupon_code: string | null;
  coupon_description: string | null;
};

type BlogPostRow = {
  id: number | string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  cover: string | null;
  featured_image: string | null;
  published_at: string | null;
  created_at: string | null;
};

type HomeOffer = {
  id: string;
  title: string;
  marketplace: string;
  price: number;
  oldPrice: number | null;
  discount: number;
  imageUrl: string | null;
  affiliateUrl: string;
  rating: number | null;
  reviews: number | null;
  expiresAt: string | null;
  updatedAt: string | null;
  installmentCount: number | null;
  installmentAmount: number | null;
  installmentInterestFree: boolean | null;
  couponCode: string | null;
  couponDescription: string | null;
};

type HomePost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  image: string | null;
  publishedAt: string | null;
};

function dedupeOffers(offers: HomeOffer[]): HomeOffer[] {
  const seen = new Set<string>();
  const unique: HomeOffer[] = [];

  for (const offer of offers) {
    if (seen.has(offer.id)) continue;
    seen.add(offer.id);
    unique.push(offer);
  }

  return unique;
}

function buildTrackedOfferUrl(id: string, source: string): string {
  return `/go/${id}?source=${encodeURIComponent(source)}`;
}

const reveal = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

const WHATSAPP_GROUP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
  "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

function EmptyOffersState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-sm font-semibold text-slate-500">
      {message}
    </div>
  );
}

const fallbackGuides: HomePost[] = [
  {
    id: "guide-1",
    title: "Melhores monitores gamer para 2026",
    slug: "melhores-monitores-gamer-2026",
    excerpt: "Comparativo rápido com foco em desempenho, painel e custo-benefício.",
    image: null,
    publishedAt: null,
  },
  {
    id: "guide-2",
    title: "Como comprar eletro com desconto real",
    slug: "como-comprar-eletro-com-desconto-real",
    excerpt: "Checklist prático para evitar falso desconto e oferta inflada.",
    image: null,
    publishedAt: null,
  },
  {
    id: "guide-3",
    title: "Guia de custo-benefício para notebooks",
    slug: "guia-custo-beneficio-notebooks",
    excerpt: "Entenda processador, RAM, SSD e tela antes de fechar a compra.",
    image: null,
    publishedAt: null,
  },
  {
    id: "guide-4",
    title: "Oferta relâmpago: como agir rápido sem errar",
    slug: "oferta-relampago-como-agir-rapido",
    excerpt: "Método para decidir em segundos e não perder oportunidade boa.",
    image: null,
    publishedAt: null,
  },
];

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOffer(row: OfferRow): HomeOffer | null {
  const affiliateUrl = String(row.affiliate_url ?? "").trim();
  if (!affiliateUrl) return null;

  const parsedPrice = toNumber(row.price);
  const price = parsedPrice !== null && parsedPrice > 0 ? parsedPrice : 0;

  const oldPriceRaw =
    toNumber(row.old_price) ?? toNumber(row.original_price) ?? toNumber(row.price_old);
  const oldPrice =
    oldPriceRaw !== null && oldPriceRaw > price && price > 0 ? oldPriceRaw : null;

  const directDiscount =
    toNumber(row.discount_percent) ?? toNumber(row.discount_pct) ?? null;
  const discount =
    directDiscount !== null && directDiscount > 0
      ? Math.round(directDiscount)
      : oldPrice
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

  return {
    id: row.id,
    title: row.title?.trim() || "Oferta sem título",
    marketplace: row.marketplace?.trim() || "Marketplace",
    price,
    oldPrice,
    discount,
    imageUrl: row.image_url,
    affiliateUrl,
    rating: toNumber(row.rating),
    reviews: toNumber(row.review_count) ?? toNumber(row.reviews_count),
    expiresAt: row.expires_at ?? null,
    updatedAt: row.updated_at ?? row.published_at ?? null,
    installmentCount: toNumber(row.installment_count),
    installmentAmount: toNumber(row.installment_amount),
    installmentInterestFree: row.installment_interest_free,
    couponCode: row.coupon_code?.trim() || null,
    couponDescription: row.coupon_description?.trim() || null,
  };
}

function formatFreshness(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return null;

  const diffMinutes = Math.max(0, Math.round((Date.now() - updatedMs) / 60_000));
  if (diffMinutes < 1) return "Atualizado agora";
  if (diffMinutes < 60) return `Atualizado há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Atualizado há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `Atualizado há ${diffDays}d`;
}

function formatInstallmentText(offer: HomeOffer): string | null {
  if (!offer.installmentCount || !offer.installmentAmount) return null;
  const suffix = offer.installmentInterestFree ? " sem juros" : "";
  return `ou ${offer.installmentCount}x de ${formatBRL(offer.installmentAmount)}${suffix}`;
}

function normalizePost(row: BlogPostRow): HomePost {
  return {
    id: String(row.id),
    title: row.title?.trim() || "Guia de compra Radar Smart",
    slug: row.slug?.trim() || "blog",
    excerpt:
      row.excerpt?.trim() ||
      "Conteúdo editorial com análise prática para comprar melhor.",
    image: row.featured_image || row.cover,
    publishedAt: row.published_at || row.created_at,
  };
}

export default function HomePage() {
  const [flashOffers, setFlashOffers] = useState<HomeOffer[]>([]);
  const [bestOffers, setBestOffers] = useState<HomeOffer[]>([]);
  const [comparatorOffers, setComparatorOffers] = useState<HomeOffer[]>([]);
  const [posts, setPosts] = useState<HomePost[]>(fallbackGuides);
  const [loading, setLoading] = useState(true);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<"price" | "discount" | "rating">(
    "price",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const publishedFlag = params.get("published");
    const fromStorage = sessionStorage.getItem("radar_publish_notice");
    if (publishedFlag === "1" && fromStorage) {
      setPublishNotice(fromStorage);
      sessionStorage.removeItem("radar_publish_notice");
      return;
    }
    if (fromStorage) {
      setPublishNotice(fromStorage);
      sessionStorage.removeItem("radar_publish_notice");
    }
  }, []);

  useEffect(() => {
    const loadData = async (isInitial: boolean) => {
      if (isInitial) setLoading(true);

      const offerSelect =
        "id,title,price,old_price,original_price,price_old,discount_pct,discount_percent,image_url,affiliate_url,product_url,marketplace,rating,review_count,reviews_count,slot_type,curations_status,created_at,updated_at,published_at,expires_at,manual_copy,status,installment_count,installment_amount,installment_interest_free,coupon_code,coupon_description";

      const [
        { data: flashRows },
        { data: bestRows },
        { data: comparatorRows },
        { data: postRows },
      ] = await Promise.all([
        supabase
          .from("offers")
          .select(offerSelect)
          .eq("status", "active")
          .eq("slot_type", "flash")
          .order("updated_at", { ascending: false })
          .limit(40),
        supabase
          .from("offers")
          .select(offerSelect)
          .eq("status", "active")
          .eq("slot_type", "best")
          .order("updated_at", { ascending: false })
          .limit(120),
        supabase
          .from("offers")
          .select(offerSelect)
          .eq("status", "active")
          .eq("slot_type", "comparator")
          .order("click_count", { ascending: false })
          .limit(40),
        supabase
          .from("blog_posts")
          .select(
            "id,title,slug,excerpt,cover,featured_image,published_at,created_at,status,is_published",
          )
          .or("status.eq.published,is_published.eq.true")
          .order("published_at", { ascending: false })
          .limit(4),
      ]);

      const normalizedFlashOffers = ((flashRows ?? []) as OfferRow[])
        .filter((row) => isOfferVisibleOnSite(row))
        .map(normalizeOffer)
        .filter((offer): offer is HomeOffer => Boolean(offer));
      const normalizedBestOffers = ((bestRows ?? []) as OfferRow[])
        .filter((row) => isOfferVisibleOnSite(row))
        .map(normalizeOffer)
        .filter((offer): offer is HomeOffer => Boolean(offer));
      const normalizedComparatorOffers = ((comparatorRows ?? []) as OfferRow[])
        .filter((row) => isOfferVisibleOnSite(row))
        .map(normalizeOffer)
        .filter((offer): offer is HomeOffer => Boolean(offer));

      const normalizedPosts = ((postRows ?? []) as BlogPostRow[])
        .map(normalizePost)
        .slice(0, 4);

      setFlashOffers(normalizedFlashOffers);
      setBestOffers(normalizedBestOffers);
      setComparatorOffers(normalizedComparatorOffers);
      setPosts(normalizedPosts.length ? normalizedPosts : fallbackGuides);
      if (isInitial) setLoading(false);
    };

    void loadData(true);
    // Ofertas relampago expiram (48h) e o contador na tela mostra o prazo
    // real — precisa buscar de novo periodicamente pra tirar as vencidas e
    // trazer as novas aprovadas, sem precisar recarregar a pagina.
    const interval = setInterval(() => void loadData(false), 60_000);
    return () => clearInterval(interval);
  }, []);

  const offers = useMemo(
    () => dedupeOffers([...flashOffers, ...bestOffers, ...comparatorOffers]),
    [flashOffers, bestOffers, comparatorOffers],
  );

  const tickerOffers: TickerOffer[] = useMemo(
    () =>
      offers.slice(0, 12).map((offer) => ({
        id: offer.id,
        title: offer.title,
        price: offer.price,
        discount_pct: offer.discount,
        image_url: offer.imageUrl,
        affiliate_url: offer.affiliateUrl,
      })),
    [offers],
  );

  const relampagoOffers = useMemo(
    () => flashOffers.slice(0, 8),
    [flashOffers],
  );

  const dayOffers = useMemo(
    () => bestOffers.slice(0, 8),
    [bestOffers],
  );

  const compareOffers = useMemo(() => {
    const base = comparatorOffers;
    const sorted = [...base].sort((a, b) => {
      if (compareMode === "price") return a.price - b.price;
      if (compareMode === "discount") return b.discount - a.discount;
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
    return sorted.slice(0, 4);
  }, [comparatorOffers, compareMode]);

  return (
    <div className="bg-[#F3F6F9] text-navy">
      <OfferTicker offers={tickerOffers} />
      <Header withTickerOffset />

      <main className="mx-auto max-w-7xl space-y-10 px-4 pb-24 pt-24 sm:space-y-14 md:pb-16">
        <motion.section
          variants={reveal}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.65 }}
          className="relative isolate overflow-hidden rounded-3xl border border-slate-200 bg-[#22223B] text-white"
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 z-0 h-full w-full object-cover"
          >
            <source src="https://radarsmart.vercel.app/design-sem-nome-6.mp4" type="video/mp4" />
            <source src="/radar-smart.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,rgba(158,106,24,0.26),transparent_34%),linear-gradient(135deg,rgba(34,34,59,0.88),rgba(34,34,59,0.72)_45%,rgba(9,12,24,0.9))]" />

          <div className="relative z-20 flex min-h-[360px] items-center justify-center px-5 py-10 text-center sm:min-h-[430px] sm:px-7 sm:py-14 md:min-h-[520px] md:px-12 lg:px-16">
            <div className="mx-auto max-w-6xl">
              <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100 sm:px-4 sm:text-[11px] sm:tracking-[0.22em]">
                <Sparkles className="h-3.5 w-3.5 text-[#9e6a18]" />
                Curadoria inteligente em tempo real
              </span>
              <h1 className="mx-auto mt-5 max-w-6xl font-hero text-[2.2rem] font-extrabold leading-[0.98] tracking-[-0.04em] sm:mt-6 sm:text-[2.65rem] md:text-[4.45rem] lg:text-[4.8rem] xl:text-[5rem]">
                <span className="block text-white">Seu radar para</span>
                <span className="block text-[#D39B32] md:whitespace-nowrap">comprar melhor.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-slate-200 sm:mt-6 sm:text-base sm:leading-7 md:text-lg md:leading-8">
                As melhores ofertas do dia,{" "}
                <span className="font-semibold text-white">já filtradas.</span>
                <br />
                Você só decide qual comprar.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
                <motion.a
                  href={WHATSAPP_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-full bg-[#9e6a18] px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_20px_rgba(158,106,24,0.4)] hover:brightness-110 sm:min-w-[220px]"
                >
                  Entrar no Grupo VIP
                </motion.a>
                <Link
                  href="/ofertas"
                  className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 sm:min-w-[220px]"
                >
                  Ver Ofertas
                </Link>
              </div>

              <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 sm:mt-10 sm:max-w-lg sm:gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-200 sm:text-xs">Ofertas monitoradas</p>
                  <p className="mt-1 text-lg font-bold sm:text-2xl">{offers.length || 0}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-200 sm:text-xs">Marketplaces</p>
                  <p className="mt-1 text-lg font-bold sm:text-2xl">
                    {new Set(offers.map((offer) => offer.marketplace)).size || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-200 sm:text-xs">Economia média</p>
                  <p className="mt-1 text-lg font-bold sm:text-2xl">
                    {offers.length
                      ? `${Math.round(
                          offers.reduce((acc, offer) => acc + offer.discount, 0) /
                            offers.length,
                        )}%`
                      : "0%"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="space-y-4"
        >
          <h2 className="font-display text-2xl font-bold text-navy">Categorias</h2>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-8 sm:gap-4 sm:overflow-visible">
            {CATEGORY_MENU.filter((cat) => cat.slug !== "outros").map((cat) => (
              <Link
                key={cat.slug}
                href={`/ofertas?categoria=${cat.slug}`}
                className="flex w-20 flex-none flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-card transition hover:-translate-y-0.5 hover:border-[#9e6a18] sm:w-auto"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#9e6a18]/10 text-xl">
                  {cat.icon}
                </span>
                <span className="text-[11px] font-semibold leading-tight text-[#22223B] sm:text-xs">
                  {cat.label}
                </span>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="space-y-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-navy">Ofertas Relâmpago</h2>
              <Flame className="h-5 w-5 text-[#9e6a18]" />
            </div>
            <Link href="/ofertas-relampago" className="text-sm font-semibold text-[#9e6a18] hover:underline">
              Ver todas
            </Link>
          </div>
          {relampagoOffers.length ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {relampagoOffers.map((offer) => (
              <article
                key={`flash-${offer.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-card sm:p-4"
              >
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-t-xl border border-slate-100 bg-white sm:h-44 md:h-52">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.imageUrl || "/next.svg"}
                    alt={offer.title}
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold sm:mt-3 sm:text-sm md:text-[15px]">{offer.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <p className="font-mono text-sm font-bold text-[#22223B] sm:text-lg md:text-xl">
                    {formatOfferPrice(offer.price)}
                  </p>
                  {offer.oldPrice ? (
                    <span className="text-[10px] text-slate-400 line-through sm:text-xs">
                      {formatBRL(offer.oldPrice)}
                    </span>
                  ) : null}
                </div>
                {formatInstallmentText(offer) ? (
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">{formatInstallmentText(offer)}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                  <span className="rounded-full bg-[#9e6a18]/15 px-2 py-1 text-[10px] font-bold text-[#9e6a18] sm:text-xs">
                    {offer.discount}% OFF
                  </span>
                  {offer.expiresAt ? <CountdownTimer endAt={offer.expiresAt} /> : null}
                </div>
                {offer.couponCode ? (
                  <p className="mt-1 truncate text-[10px] font-semibold text-emerald-600 sm:text-xs" title={offer.couponDescription ?? undefined}>
                    🏷️ Cupom {offer.couponCode}
                  </p>
                ) : null}
                {formatFreshness(offer.updatedAt) ? (
                  <p className="mt-1 text-[10px] font-medium text-slate-400">
                    {formatFreshness(offer.updatedAt)}
                  </p>
                ) : null}
                <a
                  href={buildTrackedOfferUrl(offer.id, "home_flash")}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#22223B] px-2 py-2 text-xs font-semibold text-white hover:bg-[#2f2f4d] sm:gap-2 sm:px-3 sm:text-sm"
                >
                  Comprar agora <ArrowUpRight className="h-4 w-4" />
                </a>
                </article>
              ))}
            </div>
          ) : (
            <EmptyOffersState message="Nenhuma oferta relampago publicada no momento." />
          )}
        </motion.section>

        <motion.section
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-navy">Melhores Ofertas</h2>
            <Link href="/ofertas" className="text-sm font-semibold text-[#9e6a18] hover:underline">
              Ver todas
            </Link>
          </div>
          {dayOffers.length ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {dayOffers.map((offer) => (
              <article
                key={`day-${offer.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-2.5 shadow-card transition hover:-translate-y-0.5 sm:p-4"
              >
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-t-xl border border-slate-100 bg-white sm:h-44 md:h-52">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.imageUrl || "/next.svg"}
                    alt={offer.title}
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500 sm:mt-3 sm:text-xs">
                  {offer.marketplace}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {offer.discount > 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 sm:text-[11px]">
                      {offer.discount}% OFF
                    </span>
                  ) : null}
                  {offer.oldPrice ? (
                    <span className="text-[10px] text-slate-400 line-through sm:text-xs">
                      {formatBRL(offer.oldPrice)}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 line-clamp-2 text-xs font-semibold sm:text-sm">{offer.title}</h3>
                <p className="mt-2 font-mono text-sm font-bold text-[#22223B] sm:text-lg md:text-xl">
                  {formatOfferPrice(offer.price)}
                </p>
                {formatInstallmentText(offer) ? (
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">{formatInstallmentText(offer)}</p>
                ) : null}
                {offer.couponCode ? (
                  <p className="mt-1 truncate text-[10px] font-semibold text-emerald-600 sm:text-xs" title={offer.couponDescription ?? undefined}>
                    🏷️ Cupom {offer.couponCode}
                  </p>
                ) : null}
                {formatFreshness(offer.updatedAt) ? (
                  <p className="mt-1 text-[10px] font-medium text-slate-400">
                    {formatFreshness(offer.updatedAt)}
                  </p>
                ) : null}
                <a
                  href={buildTrackedOfferUrl(offer.id, "home_best")}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#9e6a18] px-2 py-2 text-xs font-semibold text-[#9e6a18] transition group-hover:bg-[#9e6a18] group-hover:text-white sm:px-3 sm:text-sm"
                >
                  Ver oferta
                </a>
                </article>
              ))}
            </div>
          ) : (
            <EmptyOffersState message="Nenhuma oferta publicada no momento." />
          )}
        </motion.section>

        <motion.section
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold text-navy">Comparador Inteligente</h2>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1">
              {[
                { key: "price", label: "Menor preço" },
                { key: "discount", label: "Maior desconto" },
                { key: "rating", label: "Melhor nota" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCompareMode(option.key as "price" | "discount" | "rating")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    compareMode === option.key
                      ? "bg-[#22223B] text-white"
                      : "text-slate-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {compareOffers.length ? (
            <>
            <div className="mt-4 grid gap-3 md:hidden">
              {compareOffers.map((offer, index) => (
                <article
                  key={`cmp-mobile-${offer.id}`}
                  className={`rounded-2xl border p-4 ${
                    index === 0 ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {index === 0 ? "Melhor escolha" : `Ranking #${index + 1}`}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-navy">
                        {offer.title}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#9e6a18]/15 px-2 py-1 text-xs font-bold text-[#9e6a18]">
                      {offer.discount}% OFF
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Preco
                      </p>
                      <p className="mt-1 font-mono font-bold text-[#22223B]">
                        {formatOfferPrice(offer.price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Avaliacao
                      </p>
                      <p className="mt-1 font-medium text-[#22223B]">
                        {offer.rating ? offer.rating.toFixed(1) : "-"}
                      </p>
                    </div>
                  </div>
                  <a
                    href={buildTrackedOfferUrl(offer.id, "home_compare_mobile")}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-[#9e6a18] hover:text-[#9e6a18]"
                  >
                    Ver oferta <TrendingUp className="h-3.5 w-3.5" />
                  </a>
                </article>
              ))}
            </div>
            <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Ranking</th>
                  <th className="pb-3">Produto</th>
                  <th className="pb-3">Preço</th>
                  <th className="pb-3">Desconto</th>
                  <th className="pb-3">Avaliação</th>
                  <th className="pb-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {compareOffers.map((offer, index) => (
                  <tr
                    key={`cmp-${offer.id}`}
                    className={`border-b border-slate-100 ${
                      index === 0 ? "bg-amber-50/60" : "bg-white"
                    }`}
                  >
                    <td className="py-3">
                      {index === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#9e6a18] px-2 py-1 text-[11px] font-bold text-white">
                          <BadgeCheck className="h-3 w-3" /> Melhor escolha
                        </span>
                      ) : (
                        <span className="text-slate-500">#{index + 1}</span>
                      )}
                    </td>
                    <td className="py-3">
                      <p className="line-clamp-1 max-w-[260px] font-medium">{offer.title}</p>
                    </td>
                    <td className="py-3 font-mono font-bold">{formatOfferPrice(offer.price)}</td>
                    <td className="py-3 text-[#9e6a18]">{offer.discount}%</td>
                    <td className="py-3">{offer.rating ? offer.rating.toFixed(1) : "-"}</td>
                    <td className="py-3">
                      <a
                        href={buildTrackedOfferUrl(offer.id, "home_compare")}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:border-[#9e6a18] hover:text-[#9e6a18]"
                      >
                        Ver oferta <TrendingUp className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="mt-4">
              <EmptyOffersState message="Nenhuma oferta disponivel para comparar no momento." />
            </div>
          )}
        </motion.section>

        <motion.section
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-navy">Guia de Compra</h2>
            <Link href="/blog" className="text-sm font-semibold text-[#9e6a18] hover:underline">
              Ver todos posts
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {posts.slice(0, 4).map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image || "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1200"}
                  alt={post.title}
                  className="h-36 w-full rounded-xl object-cover"
                  loading="lazy"
                />
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#9e6a18]">
                  <BookOpenText className="h-3.5 w-3.5" /> Guia estratégico
                </p>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-navy">
                  {post.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.excerpt}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#9e6a18]">
                  Ler guia <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </motion.section>
      </main>

      <Footer />

      {loading ? (
        <div className="pointer-events-none fixed bottom-24 right-4 z-[80] rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow md:bottom-4">
          Atualizando ofertas...
        </div>
      ) : null}

      {publishNotice ? (
        <div className="fixed left-1/2 top-24 z-[90] w-[92%] max-w-xl -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg">
          {publishNotice}
          <button
            type="button"
            onClick={() => setPublishNotice(null)}
            className="ml-3 underline underline-offset-2"
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatOfferPrice(price: number): string {
  return price > 0 ? formatBRL(price) : "Consultar";
}


