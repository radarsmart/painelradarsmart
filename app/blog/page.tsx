import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, Zap } from "lucide-react";

import AffiliateDisclosure from "@/components/AffiliateDisclosure";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { formatBRL } from "@/lib/formatters";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata = {
  title: "Guias e blog de compras | Radar Smart",
  description:
    "Guias de compra, reviews, comparativos e análises editoriais do Radar Smart para comprar com mais segurança.",
  alternates: {
    canonical: "https://radarsmart.com.br/blog",
  },
  openGraph: {
    title: "Guias e blog de compras | Radar Smart",
    description:
      "Guias de compra, reviews, comparativos e análises editoriais do Radar Smart para comprar com mais segurança.",
    url: "https://radarsmart.com.br/blog",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Guias e blog de compras | Radar Smart",
    description:
      "Guias de compra, reviews, comparativos e análises editoriais do Radar Smart para comprar com mais segurança.",
  },
};

type BlogPostRow = {
  id: number | string;
  slug: string | null;
  title: string | null;
  excerpt: string | null;
  cover_image: string | null;
  published_at: string | null;
  created_at: string | null;
  status: string | null;
  is_published: boolean | null;
};

type RadarOfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  affiliate_url: string | null;
  product_url: string | null;
  marketplace: string | null;
};

type NormalizedBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  publishedAt: string | null;
  category: string;
};

type NormalizedRadarOffer = {
  id: string;
  title: string;
  price: number;
  buttonLabel: string;
};

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(
      value
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatPublishedDate(value: string | null): string {
  if (!value) return "Radar Smart";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Radar Smart";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(parsed);
}

function inferCategory(title: string): string {
  const normalized = title.toLowerCase();
  if (
    normalized.includes("iphone") ||
    normalized.includes("notebook") ||
    normalized.includes("monitor") ||
    normalized.includes("smartphone") ||
    normalized.includes("ssd") ||
    normalized.includes("tv") ||
    normalized.includes("tablet") ||
    normalized.includes("alexa")
  ) {
    return "Eletrônicos";
  }

  if (
    normalized.includes("air fryer") ||
    normalized.includes("cafeteira") ||
    normalized.includes("cozinha") ||
    normalized.includes("panela") ||
    normalized.includes("aspirador") ||
    normalized.includes("micro-ondas")
  ) {
    return "Casa & Cozinha";
  }

  if (
    normalized.includes("tenis") ||
    normalized.includes("tênis") ||
    normalized.includes("corrida") ||
    normalized.includes("bike") ||
    normalized.includes("academia") ||
    normalized.includes("esporte")
  ) {
    return "Esporte & Bem-estar";
  }

  return "Guia de Compras";
}

function buildExcerptFallback(title: string, category: string): string {
  if (category === "Eletrônicos") {
    return `Análise prática de ${title} com foco em desempenho, preço histórico e custo-benefício real.`;
  }

  if (category === "Casa & Cozinha") {
    return `Veja se ${title} entrega bom desempenho no dia a dia e se o preço atual realmente vale a compra.`;
  }

  if (category === "Esporte & Bem-estar") {
    return `Entenda se ${title} compensa pela qualidade, conforto e preço atual dentro da categoria.`;
  }

  return `Guia objetivo sobre ${title}, com contexto de compra, preço e leitura rápida de oportunidade.`;
}

function normalizePosts(rows: BlogPostRow[]): NormalizedBlogPost[] {
  return rows
    .map((post) => {
      const title = post.title?.trim() || "Guia de compra Radar Smart";
      const category = inferCategory(title);

      return {
        id: String(post.id),
        slug: post.slug?.trim() || "",
        title,
        excerpt: post.excerpt?.trim() || buildExcerptFallback(title, category),
        coverImage:
          post.cover_image?.trim() ||
          "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1200",
        publishedAt: post.published_at || post.created_at,
        category,
      };
    })
    .filter((post) => Boolean(post.slug));
}

function normalizeRadarOffers(rows: RadarOfferRow[]): NormalizedRadarOffer[] {
  return rows.map((offer) => {
    const marketplace = String(offer.marketplace ?? "").toLowerCase();
    const buttonLabel = marketplace.includes("amazon")
      ? "Link Amazon"
      : marketplace.includes("mercado")
        ? "Link Mercado Livre"
        : "Ver oferta";

    return {
      id: offer.id,
      title: offer.title?.trim() || "Oferta do Radar Smart",
      price: toNumber(offer.price),
      buttonLabel,
    };
  });
}

function buildTrackedOfferUrl(id: string, source: string): string {
  return `/go/${id}?source=${encodeURIComponent(source)}`;
}

async function getPosts() {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("id,slug,title,excerpt,cover_image,published_at,created_at,status,is_published")
    .or("status.eq.published,is_published.eq.true")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  return normalizePosts((data ?? []) as BlogPostRow[]);
}

async function getRadarOffers() {
  const { data } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,affiliate_url,product_url,marketplace")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(2);

  return normalizeRadarOffers((data ?? []) as RadarOfferRow[]);
}

export default async function BlogPortalPage() {
  const [posts, radarOffers] = await Promise.all([getPosts(), getRadarOffers()]);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#FDFCFB] pb-12 pt-24">
        <section className="mx-auto mb-16 max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-4 text-4xl font-black tracking-tighter text-[#1A1A1A] md:text-6xl">
            Guia de Compras <span className="text-[#FFC300]">Inteligente</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500">
            Análises profundas, comparativos reais e o melhor preço detectado pelo nosso Radar.
          </p>

          <div className="mx-auto mt-8 flex max-w-xl items-center rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Busque reviews, comparativos e oportunidades..."
              className="w-full bg-transparent px-3 text-sm outline-none"
            />
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          <main className="space-y-12 lg:col-span-3">
            {posts.length > 0 ? (
              posts.map((post) => (
                <article key={post.id} className="group">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="flex cursor-pointer flex-col gap-8 rounded-3xl border border-gray-100 bg-white p-6 transition-all duration-300 hover:shadow-xl md:flex-row"
                  >
                    <div className="h-48 w-full shrink-0 overflow-hidden rounded-2xl bg-gray-50 md:w-72">
                      <Image
                        src={post.coverImage}
                        alt={post.title}
                        width={480}
                        height={320}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>

                    <div className="flex flex-col justify-between py-2">
                      <div>
                        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[#FFC300]">
                          {post.category}
                        </span>
                        <h2 className="line-clamp-2 text-2xl font-bold text-[#1A1A1A] transition-colors group-hover:text-blue-600">
                          {post.title}
                        </h2>
                        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-500">
                          {post.excerpt}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400">
                          Publicado em {formatPublishedDate(post.publishedAt)}
                        </span>
                        <span className="flex items-center gap-2 text-sm font-black text-[#1A1A1A] transition-all group-hover:gap-4">
                          Ler Review <ArrowRight size={16} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-sm text-gray-500">
                Nenhum review publicado no momento.
              </div>
            )}
          </main>

          <aside className="space-y-8">
            <div className="relative overflow-hidden rounded-3xl bg-[#1A1A1A] p-6 text-white">
              <h3 className="relative z-10 mb-4 flex items-center gap-2 text-lg font-bold">
                <Zap className="text-[#FFC300]" />
                Radar Agora
              </h3>

              <div className="relative z-10 space-y-4">
                {radarOffers.length > 0 ? (
                  radarOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                    >
                      <p className="line-clamp-1 text-xs font-bold">{offer.title}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-[#FFC300]">
                          {formatBRL(offer.price)}
                        </span>
                        <a
                          href={buildTrackedOfferUrl(offer.id, "blog_radar_agora")}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="text-[10px] font-bold uppercase text-white/60 transition-colors hover:text-white"
                        >
                          {offer.buttonLabel}
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    Ainda não há ofertas ativas destacadas.
                  </div>
                )}
              </div>

              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-[#FFC300]/10 blur-3xl" />
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-6">
              <h3 className="mb-4 font-bold text-[#1A1A1A]">Newsletter VIP</h3>
              <p className="mb-4 text-xs text-gray-500">
                Receba os erros de preço antes de todo mundo.
              </p>
              <input
                type="email"
                placeholder="Seu melhor e-mail"
                className="mb-2 w-full rounded-xl border border-transparent bg-gray-50 px-4 py-3 text-xs outline-none focus:border-[#FFC300]"
              />
              <button
                type="button"
                className="w-full rounded-xl bg-[#FFC300] py-3 text-xs font-black text-black shadow-lg shadow-[#FFC300]/20 transition-transform hover:scale-[1.02]"
              >
                INSCREVER
              </button>
            </div>
          </aside>
        </div>

        <div className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <AffiliateDisclosure />
        </div>
      </div>
      <Footer />
    </>
  );
}

