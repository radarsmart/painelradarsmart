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
import BotaoGrupoFlutuante from "@/components/layout/BotaoGrupoFlutuante";
import { formatBRL } from "@/lib/formatters";
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
  created_at: string;
  status: string | null;
};

type BlogPostRow = {
  id: number | string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  cover_image: string | null;
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
};

type HomePost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  image: string | null;
  publishedAt: string | null;
};

const reveal = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

const WHATSAPP_GROUP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
  "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";
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
    affiliateUrl: row.affiliate_url || row.product_url || "#",
    rating: toNumber(row.rating),
    reviews: toNumber(row.review_count) ?? toNumber(row.reviews_count),
  };
}

function normalizePost(row: BlogPostRow): HomePost {
  return {
    id: String(row.id),
    title: row.title?.trim() || "Guia de compra Radar Smart",
    slug: row.slug?.trim() || "blog",
    excerpt:
      row.excerpt?.trim() ||
      "Conteúdo editorial com análise prática para comprar melhor.",
    image: row.cover_image || row.featured_image,
    publishedAt: row.published_at || row.created_at,
  };
}

export default function HomePage() {
  const [offers, setOffers] = useState<HomeOffer[]>([]);
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
    const loadData = async () => {
      setLoading(true);

      const [{ data: offerRows }, { data: postRows }] = await Promise.all([
        supabase
          .from("offers")
          .select(
            "id,title,price,old_price,original_price,price_old,discount_pct,discount_percent,image_url,affiliate_url,product_url,marketplace,rating,review_count,reviews_count,created_at,status",
          )
          .eq("status", "active")
          .eq("curations_status", "approved")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("blog_posts")
          .select(
            "id,title,slug,excerpt,cover_image,featured_image,published_at,created_at,status,is_published",
          )
          .or("status.eq.published,is_published.eq.true")
          .order("published_at", { ascending: false })
          .limit(4),
      ]);

      const normalizedOffers = ((offerRows ?? []) as OfferRow[])
        .map(normalizeOffer)
        .filter((offer): offer is HomeOffer => Boolean(offer));

      const normalizedPosts = ((postRows ?? []) as BlogPostRow[])
        .map(normalizePost)
        .slice(0, 4);

      setOffers(normalizedOffers);
      setPosts(normalizedPosts.length ? normalizedPosts : fallbackGuides);
      setLoading(false);
    };

    void loadData();
  }, []);

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

  const flashOffers = useMemo(
    () => [...offers].sort((a, b) => b.discount - a.discount).slice(0, 4),
    [offers],
  );

  const dayOffers = useMemo(() => offers.slice(0, 4), [offers]);

  const compareOffers = useMemo(() => {
    const base = offers.slice(0, 6);
    const sorted = [...base].sort((a, b) => {
      if (compareMode === "price") return a.price - b.price;
      if (compareMode === "discount") return b.discount - a.discount;
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
    return sorted.slice(0, 4);
  }, [offers, compareMode]);

  return (
    <div className="bg-[#F3F6F9] text-navy">
      <OfferTicker offers={tickerOffers} />
      <Header withTickerOffset />

      <main className="mx-auto max-w-7xl space-y-14 px-4 pb-16 pt-24">
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
          <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#22223B]/70 via-[#22223B]/65 to-[#22223B]/70" />

          <div className="relative z-20 grid gap-8 p-7 md:grid-cols-[1.2fr_0.8fr] md:p-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5 text-[#9e6a18]" />
                Curadoria inteligente em tempo real
              </span>
              <h1 className="mt-4 font-display text-4xl font-black leading-[1.1] md:text-5xl">
                Economize com inteligência e compre no momento certo.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-slate-200 md:text-base">
                A Radar Smart rastreia ofertas, compara preços e entrega oportunidades prontas para decisão.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <motion.a
                  href={WHATSAPP_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-full bg-[#9e6a18] px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_20px_rgba(158,106,24,0.4)] hover:brightness-110"
                >
                  Entrar no Grupo VIP
                </motion.a>
                <Link
                  href="/ofertas"
                  className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Ver Ofertas
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase text-slate-200">Ofertas monitoradas</p>
                <p className="mt-1 text-2xl font-bold">{offers.length || 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase text-slate-200">Marketplaces</p>
                <p className="mt-1 text-2xl font-bold">2+</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase text-slate-200">Economia média</p>
                <p className="mt-1 text-2xl font-bold">
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
            <h2 className="font-display text-2xl font-bold text-navy">Ofertas Relâmpago</h2>
            <Flame className="h-5 w-5 text-[#9e6a18]" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {flashOffers.map((offer, index) => (
              <article
                key={`flash-${offer.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
              >
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-t-xl border border-slate-100 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.imageUrl || "/next.svg"}
                    alt={offer.title}
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold">{offer.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="font-mono text-xl font-bold text-[#22223B]">
                    {formatOfferPrice(offer.price)}
                  </p>
                  {offer.oldPrice ? (
                    <span className="text-xs text-slate-400 line-through">
                      {formatBRL(offer.oldPrice)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="rounded-full bg-[#9e6a18]/15 px-2 py-1 text-xs font-bold text-[#9e6a18]">
                    {offer.discount}% OFF
                  </span>
                  <CountdownTimer
                    endAt={new Date(Date.now() + (index + 2) * 45 * 60 * 1000).toISOString()}
                  />
                </div>
                <a
                  href={offer.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#22223B] px-3 py-2 text-sm font-semibold text-white hover:bg-[#2f2f4d]"
                >
                  Comprar agora <ArrowUpRight className="h-4 w-4" />
                </a>
              </article>
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
            <h2 className="font-display text-2xl font-bold text-navy">Ofertas do Dia</h2>
            <Link href="/ofertas" className="text-sm font-semibold text-[#9e6a18] hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dayOffers.map((offer) => (
              <article
                key={`day-${offer.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5"
              >
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-t-xl border border-slate-100 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.imageUrl || "/next.svg"}
                    alt={offer.title}
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                  {offer.marketplace}
                </p>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold">{offer.title}</h3>
                <p className="mt-2 font-mono text-xl font-bold text-[#22223B]">
                  {formatOfferPrice(offer.price)}
                </p>
                <a
                  href={offer.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-[#9e6a18] px-3 py-2 text-sm font-semibold text-[#9e6a18] transition group-hover:bg-[#9e6a18] group-hover:text-white"
                >
                  Ver oferta
                </a>
              </article>
            ))}
          </div>
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

          <div className="mt-4 overflow-x-auto">
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
                        href={offer.affiliateUrl}
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <BotaoGrupoFlutuante />

      {loading ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[80] rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow">
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


